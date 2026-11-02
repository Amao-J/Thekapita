from django.db import transaction
from django.utils import timezone

from . import ledger
from .models import RideBooking, RideDriver, Wallet


class RideServiceError(Exception):
    """A ride lifecycle action could not be completed."""


@transaction.atomic
def dispatch_requested_ride(booking_id):
    booking = RideBooking.objects.select_for_update().get(pk=booking_id)
    if booking.status != RideBooking.Status.REQUESTED:
        return booking

    drivers = RideDriver.objects.select_for_update().filter(
        is_active=True,
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
    if booking.status not in {RideBooking.Status.REQUESTED, RideBooking.Status.ASSIGNED}:
        raise RideServiceError("Only requested or assigned rides can be cancelled.")

    if booking.status == RideBooking.Status.ASSIGNED:
        driver = RideDriver.objects.select_for_update().get(pk=booking.driver_id)
        ledger.refund_ride(user, booking.fare, booking.reference)
        booking.refunded_at = timezone.now()
        driver.is_available = True
        driver.save(update_fields=["is_available"])

    booking.status = RideBooking.Status.CANCELLED
    booking.save(update_fields=["status", "refunded_at", "updated_at"])
    return booking


@transaction.atomic
def complete_ride(booking_id):
    booking = RideBooking.objects.select_for_update().get(pk=booking_id)
    if booking.status != RideBooking.Status.ASSIGNED:
        raise RideServiceError("Only assigned rides can be completed.")
    booking.status = RideBooking.Status.COMPLETED
    booking.save(update_fields=["status", "updated_at"])
    if booking.driver_id:
        RideDriver.objects.filter(pk=booking.driver_id).update(is_available=True)
    return booking
