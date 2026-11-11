import logging
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from . import ledger
from .models import LedgerEntry, RideBooking, RideDriver, Wallet


logger = logging.getLogger(__name__)


class RideServiceError(Exception):
    """A ride lifecycle action could not be completed."""


class RideNotFound(RideServiceError):
    """No such ride for this driver."""


class InvalidPin(RideServiceError):
    """The driver typed the wrong rider PIN."""


@transaction.atomic
def dispatch_requested_ride(booking_id):
    booking = RideBooking.objects.select_for_update().get(pk=booking_id)
    if booking.status != RideBooking.Status.REQUESTED:
        return booking

    drivers = RideDriver.objects.select_for_update().filter(
        is_active=True,
        is_online=True,
        is_available=True,
    ).order_by("pk")
    driver = next(
        (
            candidate
            for candidate in drivers
            if not candidate.ride_types or booking.ride_type in candidate.ride_types
        ),
        None,
    )
    if driver is None:
        return booking

    wallet, _ = Wallet.objects.get_or_create(user_id=booking.user_id)
    wallet = Wallet.objects.select_for_update().get(pk=wallet.pk)
    if wallet.balance < booking.fare:
        raise RideServiceError("Insufficient wallet balance for this ride.")

    ledger.charge_ride(booking.user, booking.fare, booking.reference)
    driver.is_available = False
    driver.save(update_fields=["is_available"])
    now = timezone.now()
    booking.driver = driver
    booking.status = RideBooking.Status.ASSIGNED
    booking.assigned_at = now
    booking.charged_at = now
    booking.save(update_fields=["driver", "status", "assigned_at", "charged_at", "updated_at"])
    return booking


@transaction.atomic
def cancel_ride(booking_id, user):
    booking = RideBooking.objects.select_for_update().select_related("driver").get(
        pk=booking_id,
        user=user,
    )
    cancellable = {RideBooking.Status.REQUESTED, RideBooking.Status.ASSIGNED, RideBooking.Status.ARRIVED}
    if booking.status not in cancellable:
        raise RideServiceError("This ride can no longer be cancelled.")

    if booking.status in {RideBooking.Status.ASSIGNED, RideBooking.Status.ARRIVED}:
        driver = RideDriver.objects.select_for_update().get(pk=booking.driver_id)
        ledger.refund_ride(user, booking.fare, booking.reference)
        booking.refunded_at = timezone.now()
        driver.is_available = True
        driver.save(update_fields=["is_available"])

    booking.status = RideBooking.Status.CANCELLED
    booking.save(update_fields=["status", "refunded_at", "updated_at"])
    return booking


def driver_payout_for(fare: Decimal) -> Decimal:
    pct = Decimal(str(getattr(settings, "RIDE_PLATFORM_FEE_PERCENT", "12.5")))
    return (fare * (Decimal("100") - pct) / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@transaction.atomic
def complete_ride(booking_id):
    """Finish a ride, free the driver and pay them (fare minus platform fee).
    Staff may complete from any live state; drivers go through driver_complete_trip()."""
    booking = RideBooking.objects.select_for_update().select_related("driver").get(pk=booking_id)
    live = {RideBooking.Status.ASSIGNED, RideBooking.Status.ARRIVED, RideBooking.Status.IN_PROGRESS}
    if booking.status not in live:
        raise RideServiceError("Only assigned rides can be completed.")
    now = timezone.now()
    booking.status = RideBooking.Status.COMPLETED
    booking.completed_at = now
    update_fields = ["status", "completed_at", "updated_at"]
    driver = booking.driver
    if driver is not None and driver.user_id and booking.charged_at and not booking.refunded_at:
        payout = driver_payout_for(booking.fare)
        Wallet.objects.get_or_create(user_id=driver.user_id)
        ledger.credit(driver.user, payout, booking.reference, kind=LedgerEntry.Kind.RIDE_PAYOUT)
        booking.driver_payout = payout
        update_fields.append("driver_payout")
    booking.save(update_fields=update_fields)
    if booking.driver_id:
        RideDriver.objects.filter(pk=booking.driver_id).update(is_available=True)
    try:
        dispatch_pending_rides()  # the driver we just freed may be able to take a queued request
    except Exception:  # never let a dispatch hiccup undo a finished trip
        logger.exception("dispatch_pending_rides failed after completing %s", booking.reference)
    return booking


def dispatch_pending_rides():
    """Give queued requests (oldest first) to any driver who is now free. Called when a
    driver goes online or finishes a trip. A rider who can no longer afford the fare is skipped."""
    assigned = 0
    for booking_id in list(
        RideBooking.objects.filter(status=RideBooking.Status.REQUESTED)
        .order_by("created_at", "pk").values_list("pk", flat=True)[:50]
    ):
        try:
            if dispatch_requested_ride(booking_id).status == RideBooking.Status.ASSIGNED:
                assigned += 1
        except RideServiceError:
            continue
    return assigned


def _driver_ride(driver, reference, *allowed):
    try:
        booking = RideBooking.objects.select_for_update().get(reference=reference, driver=driver)
    except RideBooking.DoesNotExist:
        raise RideNotFound("Ride not found.")
    if booking.status not in allowed:
        raise RideServiceError(f"This ride is {booking.get_status_display().lower()}; that action isn't available.")
    return booking


@transaction.atomic
def driver_mark_arrived(driver, reference):
    booking = _driver_ride(driver, reference, RideBooking.Status.ASSIGNED)
    booking.status = RideBooking.Status.ARRIVED
    booking.save(update_fields=["status", "updated_at"])
    return booking


@transaction.atomic
def driver_start_trip(driver, reference, otp):
    booking = _driver_ride(driver, reference, RideBooking.Status.ARRIVED)
    if not booking.pickup_otp or str(otp).strip() != booking.pickup_otp:
        raise InvalidPin("Incorrect rider PIN. Ask the rider for the 4-digit code in their app.")
    booking.status = RideBooking.Status.IN_PROGRESS
    booking.started_at = timezone.now()
    booking.save(update_fields=["status", "started_at", "updated_at"])
    return booking


@transaction.atomic
def driver_complete_trip(driver, reference):
    booking = _driver_ride(driver, reference, RideBooking.Status.IN_PROGRESS)
    return complete_ride(booking.pk)
