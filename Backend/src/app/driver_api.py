"""Driver portal API: register as a driver, go online, share location, run a trip.

Everything that changes a ride goes through ride_service so the rider app (/api/rides)
and this portal always agree on status, payout and refunds."""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from ninja import Field, Router, Schema
from ninja.errors import HttpError
from pydantic import field_validator

from . import ride_service
from .auth import JWTAuth
from .models import LedgerEntry, RideBooking, RideDriver, Wallet
from .ride_service import InvalidPin, RideNotFound, RideServiceError

driver_router = Router(auth=JWTAuth())

ACTIVE_STATUSES = (
    RideBooking.Status.ASSIGNED,
    RideBooking.Status.ARRIVED,
    RideBooking.Status.IN_PROGRESS,
)


# ---- schemas ----------------------------------------------------------------

class DriverRegisterIn(Schema):
    phone: str = Field(min_length=7, max_length=20)
    vehicle: str = Field(min_length=2, max_length=100)
    plate_number: str = Field(min_length=3, max_length=20)
    ride_types: list[str] = Field(min_length=1)

    @field_validator("phone", "vehicle")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field can't be blank.")
        return v

    @field_validator("plate_number")
    @classmethod
    def _plate(cls, v: str) -> str:
        v = " ".join(v.upper().split())
        if len(v) < 3:
            raise ValueError("Enter a valid plate number.")
        return v

    @field_validator("ride_types")
    @classmethod
    def _types(cls, v: list[str]) -> list[str]:
        if not set(v).issubset(set(RideBooking.RideType.values)):
            raise ValueError("Choose only supported ride types.")
        return sorted(set(v))


class DriverUpdateIn(Schema):
    # Only contact details are self-service. Plate number and ride types change who may take
    # which rides, so those stay with staff (admin) rather than the driver.
    phone: str | None = Field(None, min_length=7, max_length=20)
    vehicle: str | None = Field(None, min_length=2, max_length=100)


class DriverOut(Schema):
    id: int
    name: str
    phone: str
    vehicle: str
    plate_number: str
    ride_types: list[str]
    is_active: bool
    is_online: bool
    is_available: bool
    latitude: float | None = None
    longitude: float | None = None


class StatusIn(Schema):
    online: bool


class LocationIn(Schema):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class StartTripIn(Schema):
    otp: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class DriverRideOut(Schema):
    reference: str
    status: str
    status_label: str
    ride_type: str
    pickup: str
    destination: str
    pickup_lat: float | None = None
    pickup_lng: float | None = None
    destination_lat: float | None = None
    destination_lng: float | None = None
    fare: Decimal
    payout: Decimal
    rider_name: str
    rider_phone: str
    created_at: str


class EarningsDay(Schema):
    date: str
    label: str
    earnings: Decimal


class SummaryOut(Schema):
    today_earnings: Decimal
    completed_today: int
    total_trips: int
    balance: Decimal
    week: list[EarningsDay]
    platform_fee_percent: Decimal


# ---- helpers ----------------------------------------------------------------

def _driver(request) -> RideDriver:
    driver = RideDriver.objects.filter(user=request.auth).first()
    if driver is None:
        # 403 is how the web app knows to send the user to driver-signup.html.
        raise HttpError(403, "You are not registered as a driver.")
    return driver


def _driver_out(d: RideDriver) -> dict:
    return {
        "id": d.pk, "name": d.name, "phone": d.phone, "vehicle": d.vehicle,
        "plate_number": d.plate_number, "ride_types": d.ride_types or [],
        "is_active": d.is_active, "is_online": d.is_online, "is_available": d.is_available,
        "latitude": d.latitude, "longitude": d.longitude,
    }


def _ride_out(b: RideBooking) -> dict:
    rider = b.user
    profile = getattr(rider, "profile", None)
    return {
        "reference": b.reference,
        "status": b.status,
        "status_label": b.get_status_display(),
        "ride_type": b.ride_type,
        "pickup": b.pickup,
        "destination": b.destination,
        "pickup_lat": b.pickup_lat, "pickup_lng": b.pickup_lng,
        "destination_lat": b.dest_lat, "destination_lng": b.dest_lng,
        "fare": b.fare,
        "payout": b.driver_payout if b.driver_payout is not None else ride_service.driver_payout_for(b.fare),
        "rider_name": rider.first_name or "Rider",
        "rider_phone": profile.phone if profile else "",
        "created_at": b.created_at.isoformat(),
    }


def _rides_qs():
    return RideBooking.objects.select_related("user__profile", "driver")


def _transition(fn, *args):
    try:
        return fn(*args)
    except InvalidPin as exc:
        raise HttpError(422, str(exc))
    except RideNotFound as exc:
        raise HttpError(404, str(exc))
    except RideServiceError as exc:
        raise HttpError(409, str(exc))


# ---- registration & status --------------------------------------------------

@driver_router.get("/me", response=DriverOut)
def me(request):
    return _driver_out(_driver(request))


@driver_router.patch("/me", response=DriverOut)
def update_me(request, payload: DriverUpdateIn):
    """Phone and vehicle only. Plate number and ride types decide who may take which rides,
    so changing them needs staff (admin)."""
    driver = _driver(request)
    if not driver.is_available:
        raise HttpError(409, "Finish your current trip before changing your vehicle details.")
    data = {k: v.strip() for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if any(not v for v in data.values()):
        raise HttpError(422, "Phone and vehicle can't be blank.")
    for field, value in data.items():
        setattr(driver, field, value)
    if data:
        driver.save(update_fields=list(data))
    return _driver_out(driver)


@driver_router.post("/register", response={201: DriverOut})
def register(request, payload: DriverRegisterIn):
    if RideDriver.objects.filter(user=request.auth).exists():
        raise HttpError(409, "You are already registered as a driver.")
    user = request.auth
    try:
        with transaction.atomic():
            driver = RideDriver.objects.create(
                user=user,
                name=(user.first_name or user.email or user.username)[:120],
                phone=payload.phone,
                vehicle=payload.vehicle,
                plate_number=payload.plate_number,
                ride_types=payload.ride_types,
                is_active=settings.DRIVER_AUTO_APPROVE,
                is_online=False,
            )
            Wallet.objects.get_or_create(user=user)
    except IntegrityError:
        raise HttpError(409, "That plate number (or your account) is already registered as a driver.")
    return 201, _driver_out(driver)


@driver_router.post("/status", response=DriverOut)
def set_status(request, payload: StatusIn):
    driver = _driver(request)
    if not driver.is_active:
        raise HttpError(409, "Your driver account is awaiting approval.")
    if not payload.online and not driver.is_available:
        raise HttpError(409, "Finish your current trip before going offline.")
    driver.is_online = payload.online
    driver.save(update_fields=["is_online"])
    if payload.online:
        ride_service.dispatch_pending_rides()
    driver.refresh_from_db()
    return _driver_out(driver)


@driver_router.post("/location", response={204: None})
def update_location(request, payload: LocationIn):
    driver = _driver(request)
    driver.latitude = payload.latitude
    driver.longitude = payload.longitude
    driver.location_updated_at = timezone.now()
    driver.save(update_fields=["latitude", "longitude", "location_updated_at"])
    return 204, None


# ---- trips ------------------------------------------------------------------

@driver_router.get("/active", response=DriverRideOut | None)
def active_ride(request):
    """The ride the driver is on right now (or null). The portal polls this."""
    driver = _driver(request)
    if (
        driver.is_active and driver.is_online and driver.is_available
        and RideBooking.objects.filter(status=RideBooking.Status.REQUESTED).exists()
    ):
        ride_service.dispatch_pending_rides()  # safety net for a missed trigger
    booking = _rides_qs().filter(driver=driver, status__in=ACTIVE_STATUSES).order_by("-assigned_at").first()
    return _ride_out(booking) if booking else None


@driver_router.post("/rides/{reference}/arrived", response=DriverRideOut)
def arrived(request, reference: str):
    booking = _transition(ride_service.driver_mark_arrived, _driver(request), reference)
    return _ride_out(_rides_qs().get(pk=booking.pk))


@driver_router.post("/rides/{reference}/start", response=DriverRideOut)
def start_trip(request, reference: str, payload: StartTripIn):
    booking = _transition(ride_service.driver_start_trip, _driver(request), reference, payload.otp)
    return _ride_out(_rides_qs().get(pk=booking.pk))


@driver_router.post("/rides/{reference}/complete", response=DriverRideOut)
def complete_trip(request, reference: str):
    booking = _transition(ride_service.driver_complete_trip, _driver(request), reference)
    return _ride_out(_rides_qs().get(pk=booking.pk))


@driver_router.get("/rides", response=list[DriverRideOut])
def ride_history(request, limit: int = 20, offset: int = 0):
    driver = _driver(request)
    limit, offset = max(1, min(limit, 100)), max(0, offset)
    qs = _rides_qs().filter(driver=driver).order_by("-created_at", "-id")[offset:offset + limit]
    return [_ride_out(b) for b in qs]


@driver_router.get("/summary", response=SummaryOut)
def summary(request):
    driver = _driver(request)
    wallet, _ = Wallet.objects.get_or_create(user=request.auth)
    today = timezone.localdate()
    start = timezone.make_aware(datetime.combine(today - timedelta(days=6), time.min))
    payouts = LedgerEntry.objects.filter(
        wallet=wallet, kind=LedgerEntry.Kind.RIDE_PAYOUT, created_at__gte=start
    )
    per_day = {
        row["day"]: row["total"]
        for row in payouts.annotate(day=TruncDate("created_at", tzinfo=timezone.get_current_timezone()))
        .values("day").annotate(total=Sum("amount"))
    }
    week = []
    for i in range(7):
        day = today - timedelta(days=6 - i)
        week.append({
            "date": day.isoformat(), "label": day.strftime("%a"),
            "earnings": per_day.get(day) or Decimal("0.00"),
        })
    done = RideBooking.objects.filter(driver=driver, status=RideBooking.Status.COMPLETED)
    today_start = timezone.make_aware(datetime.combine(today, time.min))
    return {
        "today_earnings": per_day.get(today) or Decimal("0.00"),
        "completed_today": done.filter(completed_at__gte=today_start).count(),
        "total_trips": done.count(),
        "balance": wallet.balance,
        "week": week,
        "platform_fee_percent": Decimal(str(settings.RIDE_PLATFORM_FEE_PERCENT)),
    }
