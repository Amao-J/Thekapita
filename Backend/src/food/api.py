import datetime as dt
import re
import uuid

from django.db import IntegrityError, transaction
from django.db.models import Q, Sum, TextField
from django.db.models.functions import Cast
from django.http import JsonResponse
from django.utils import timezone
from django.utils.text import slugify
from ninja import Field, Router, Schema
from ninja.errors import HttpError
from pydantic import field_validator

from app import ledger
from app.auth import JWTAuth
from app.models import Wallet
from app.throttles import user_throttle
from app.idempotency import IdempotencyConflict, get_or_create_idempotent_response
from app import routing
from directory import storage as image_storage
from directory import uploads
from directory.api import ATTRIBUTION as DIRECTORY_ATTRIBUTION
from directory.api import _approved as approved_listings
from directory.api import _haversine_km, _ranked
from directory.models import Listing

from . import services
from .models import FoodOrder, MenuItem, Reservation, Restaurant

router = Router()


# ---- schemas ---------------------------------------------------------------

class MenuItemOut(Schema):
    id: int
    name: str
    description: str = ""
    category: str = ""
    price: float
    image_url: str | None = None
    is_available: bool


class RestaurantOut(Schema):
    id: int
    slug: str
    name: str
    category: str
    category_label: str
    tags: list[str]
    description: str = ""
    image_url: str | None = None
    image_credit: str | None = None  # "Photo © Google · by …" when image_url is a Google photo
    address: str
    phone: str
    hours: str = ""
    delivery_fee: float
    eta_min: int
    eta_max: int
    is_open: bool
    rating: float | None = None  # no reviews model yet
    source: str = "food"
    is_orderable: bool = True
    attribution: str | None = None
    services: list[str] = Field(default_factory=list)
    review_count: int = 0
    latitude: float | None = None
    longitude: float | None = None
    distance_km: float | None = None   # straight-line, only when the request included lat & lng


class RestaurantDetailOut(RestaurantOut):
    menu: list[MenuItemOut]


class OrderItemIn(Schema):
    id: int
    qty: int = Field(1, ge=1, le=50)


class OrderCreateIn(Schema):
    restaurant: str = Field(max_length=140)  # slug
    items: list[OrderItemIn] = Field(..., min_length=1, max_length=50)
    address: str = Field("", max_length=255)
    phone: str = Field("", max_length=30)
    note: str = Field("", max_length=300)


class OrderItemOut(Schema):
    name: str
    unit_price: float
    qty: int


class OrderOut(Schema):
    reference: str
    status: str
    status_label: str
    restaurant: str
    restaurant_slug: str
    items: list[OrderItemOut]
    subtotal: float
    delivery_fee: float
    total: float
    delivery_address: str = ""
    customer_name: str = ""
    note: str = ""
    created_at: str


class ReservationIn(Schema):
    restaurant: str = Field(max_length=140)  # slug
    date: dt.date
    time: dt.time
    guests: int = Field(2, ge=1, le=20)
    note: str = Field("", max_length=300)


class ReservationOut(Schema):
    reference: str
    restaurant: str
    restaurant_slug: str
    date: str
    time: str
    guests: int
    status: str
    status_label: str


class VendorRegisterIn(Schema):
    name: str = Field(min_length=2, max_length=120)
    category: str
    address: str = Field(min_length=3, max_length=255)
    phone: str = Field(min_length=7, max_length=30)


def _http_url(v):
    """Only http(s) image links are stored, so a javascript:/data: URL can never reach an <img> or link."""
    v = (v or "").strip()
    if v and not re.match(r"^https?://", v, re.I):
        raise ValueError("Image links must start with http:// or https://")
    return v


class StoreUpdateIn(Schema):
    name: str | None = Field(None, min_length=2, max_length=120)
    category: str | None = None
    address: str | None = Field(None, min_length=3, max_length=255)
    phone: str | None = Field(None, min_length=7, max_length=30)
    hours: str | None = Field(None, max_length=120)
    image_url: str | None = Field(None, max_length=500)
    delivery_fee: float | None = Field(None, ge=0, le=100000)
    is_open: bool | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)

    @field_validator("image_url")
    @classmethod
    def _img(cls, v):
        return None if v is None else _http_url(v)


class MenuItemIn(Schema):
    name: str = Field(min_length=1, max_length=120)
    price: float = Field(gt=0, le=10_000_000)
    category: str = Field("", max_length=60)
    description: str = Field("", max_length=300)
    image_url: str = Field("", max_length=500)

    @field_validator("image_url")
    @classmethod
    def _img(cls, v):
        return _http_url(v)


class MenuItemUpdateIn(Schema):
    name: str | None = Field(None, min_length=1, max_length=120)
    price: float | None = Field(None, gt=0, le=10_000_000)
    is_available: bool | None = None


class VendorStatusIn(Schema):
    status: str


class VendorOut(RestaurantOut):
    is_active: bool


class VendorSummaryOut(Schema):
    sales_today: float        # orders placed today that weren't declined/cancelled (held in escrow or paid out)
    active_orders: int
    completed_today: int
    balance: float            # the owner's wallet: escrow released to them after customers confirm


# ---- serializers ------------------------------------------------------------

def _distance(near, lat, lng):
    if near and lat is not None and lng is not None:
        return round(_haversine_km(near[0], near[1], lat, lng), 2)
    return None


def _restaurant(r, near=None):
    return {
        "id": r.id, "slug": r.slug, "name": r.name, "category": r.category,
        "category_label": r.get_category_display(), "tags": r.tags or [],
        "description": r.description, "image_url": image_storage.image_url_for(r.image_key) or r.image_url or None,
        "address": r.address, "phone": r.phone, "hours": r.hours,
        "delivery_fee": float(r.delivery_fee), "eta_min": r.eta_min, "eta_max": r.eta_max,
        "is_open": r.is_open, "rating": None, "source": "food", "is_orderable": True,
        "attribution": None, "services": [], "review_count": 0,
        "latitude": r.latitude, "longitude": r.longitude, "distance_km": _distance(near, r.latitude, r.longitude),
    }


def _directory_restaurant(listing, near=None):
    """A restaurant that is only in the directory (no vendor account yet): browsable, not orderable."""
    city = listing.city.strip()
    address = listing.address
    if city and city.casefold() not in address.casefold():
        address = f"{address}, {city}"
    return {
        "id": -listing.id,
        "slug": f"directory-{listing.id}",
        "name": listing.name,
        "category": listing.subtype or "external",
        "category_label": listing.get_category_display(),
        "tags": listing.services or [],
        "description": listing.description,
        "image_url": listing.image_url,
        "image_credit": listing.image_credit,
        "address": address,
        "phone": listing.phone,
        "hours": listing.hours,
        "delivery_fee": 0,
        "eta_min": 0,
        "eta_max": 0,
        "is_open": False,
        "rating": round(listing.avg_rating, 1) if listing.avg_rating is not None else None,
        "source": "directory",
        "is_orderable": False,
        "attribution": DIRECTORY_ATTRIBUTION.get(listing.source),
        "services": listing.services or [],
        "review_count": listing.n_reviews,
        "latitude": listing.latitude, "longitude": listing.longitude,
        "distance_km": _distance(near, listing.latitude, listing.longitude),
    }


def _menu_item(m):
    return {
        "id": m.id, "name": m.name, "description": m.description, "category": m.category,
        "price": float(m.price), "image_url": image_storage.image_url_for(m.image_key) or m.image_url or None,
        "is_available": m.is_available,
    }


def _order(o):
    return {
        "reference": o.reference, "status": o.status, "status_label": o.get_status_display(),
        "restaurant": o.restaurant.name, "restaurant_slug": o.restaurant.slug,
        "items": [{"name": i.name, "unit_price": float(i.unit_price), "qty": i.qty} for i in o.items.all()],
        "subtotal": float(o.subtotal), "delivery_fee": float(o.delivery_fee), "total": float(o.total),
        "delivery_address": o.delivery_address, "customer_name": o.customer.first_name or "Customer",
        "note": o.note, "created_at": o.created_at.isoformat(),
    }


def _reservation(r):
    return {
        "reference": r.reference, "restaurant": r.restaurant.name, "restaurant_slug": r.restaurant.slug,
        "date": r.date.isoformat(), "time": r.time.strftime("%H:%M"), "guests": r.guests,
        "status": r.status, "status_label": r.get_status_display(),
    }


def _listed():
    return Restaurant.objects.filter(is_active=True)


def _orders_qs():
    return FoodOrder.objects.select_related("restaurant", "customer").prefetch_related("items")


# ---- public catalogue -------------------------------------------------------

SUBTYPES = ("buka", "bakery", "grill", "fine")


@router.get("/restaurants", response=list[RestaurantOut])
def list_restaurants(request, category: str | None = None, tag: str | None = None, q: str | None = None,
                     source: str = "all", lat: float | None = None, lng: float | None = None,
                     limit: int = 60, offset: int = 0):
    """Restaurants customers can order from (source=food) and restaurants that are only in the directory
    (source=directory), or both (source=all, orderable ones first).

    Paging and filtering happen in the database for the directory rows, so a request costs about the same whether
    there are 500 or 50,000 of them: do NOT fetch every page to build a full list on the client."""
    if source not in ("all", "food", "directory"):
        raise HttpError(422, "source must be all, food or directory.")
    if (lat is None) != (lng is None) or (lat is not None and not (-90 <= lat <= 90 and -180 <= lng <= 180)):
        raise HttpError(422, "Send both lat and lng, as valid coordinates, or neither.")
    limit, offset = max(1, min(limit, 100)), max(offset, 0)
    near = (lat, lng) if lat is not None else None
    wanted = (category or "all").casefold()
    needle = q.strip() if q and q.strip() else None
    wanted_tag = tag.strip() if tag and tag.strip() else None

    vendors = []
    if source in ("all", "food"):
        vq = _listed()
        if wanted != "all":
            vq = vq.filter(category=wanted) if wanted in Restaurant.Category.values else vq.none()
        if needle:
            vq = vq.filter(
                Q(name__icontains=needle) | Q(description__icontains=needle) | Q(address__icontains=needle)
                | Q(items__name__icontains=needle, items__is_available=True)
            ).distinct()
        vendors = list(vq)
        if wanted_tag:
            vendors = [r for r in vendors if wanted_tag.casefold() in [t.casefold() for t in (r.tags or [])]]
        vendors.sort(key=lambda r: (
            _distance(near, r.latitude, r.longitude) if _distance(near, r.latitude, r.longitude) is not None else 1e9,
            r.name.casefold(), r.id,
        ))

    def directory_page(page_limit, page_offset):
        dq = approved_listings().filter(category=Listing.Category.RESTAURANTS)
        if wanted in SUBTYPES:
            dq = dq.filter(subtype=wanted)
        elif wanted == "external":
            dq = dq.filter(subtype="")
        elif wanted != "all":
            return []
        if needle or wanted_tag:
            dq = dq.annotate(services_text=Cast("services", TextField()))
        if needle:
            dq = dq.filter(
                Q(name__icontains=needle) | Q(description__icontains=needle) | Q(address__icontains=needle)
                | Q(city__icontains=needle) | Q(services_text__icontains=needle)
            )
        if wanted_tag:
            dq = dq.filter(services_text__icontains=f'"{wanted_tag}"')
        return [_directory_restaurant(l, near) for l in _ranked(dq, near, page_limit, page_offset)]

    if source == "food":
        return [_restaurant(r, near) for r in vendors[offset: offset + limit]]
    if source == "directory":
        return directory_page(limit, offset)
    page = [_restaurant(r, near) for r in vendors[offset: offset + limit]]
    if len(page) < limit:  # vendors are exhausted: continue with directory rows
        page += directory_page(limit - len(page), max(0, offset - len(vendors)))
    return page


@router.get("/restaurants/{slug}", response=RestaurantDetailOut)
def get_restaurant(request, slug: str):
    try:
        r = _listed().prefetch_related("items").get(slug=slug)
    except Restaurant.DoesNotExist:
        raise HttpError(404, "Restaurant not found.")
    return {**_restaurant(r), "menu": [_menu_item(m) for m in r.items.all() if m.is_available]}


# ---- customer orders --------------------------------------------------------

@router.post("/orders", auth=JWTAuth())
def create_order(request, payload: OrderCreateIn):
    key = request.headers.get("Idempotency-Key", "").strip()
    if not key:
        raise HttpError(400, "Idempotency-Key header is required for this endpoint.")
    if len(key) > 64:
        raise HttpError(400, "Idempotency-Key must be 64 characters or fewer.")
    user = request.auth

    def do_place():
        profile = getattr(user, "profile", None)
        try:
            order = services.place_order(
                user, payload.restaurant, [(i.id, i.qty) for i in payload.items],
                address=payload.address.strip() or (profile.address if profile else ""),
                phone=payload.phone.strip() or (profile.phone if profile else ""),
                note=payload.note.strip(),
            )
        except services.FoodError as exc:
            return 422, {"detail": str(exc)}
        order = _orders_qs().get(pk=order.pk)
        return 201, {"order": _order(order), "balance": str(user.wallet.balance)}

    try:
        with transaction.atomic():
            status_code, body = get_or_create_idempotent_response(
                key=key, user_id=user.id, body=payload.dict(), compute=do_place,
            )
    except IdempotencyConflict as exc:
        raise HttpError(409, str(exc))
    except IntegrityError:
        raise HttpError(409, "Duplicate request in progress. Retry in a moment.")
    return JsonResponse(body, status=status_code)


@router.get("/orders", response=list[OrderOut], auth=JWTAuth())
def my_orders(request, limit: int = 30):
    qs = _orders_qs().filter(customer=request.auth)[: max(1, min(limit, 100))]
    return [_order(o) for o in qs]


def _own_order(request, reference):
    try:
        return FoodOrder.objects.get(reference=reference, customer=request.auth)
    except FoodOrder.DoesNotExist:
        raise HttpError(404, "Order not found.")


def _run(fn, order):
    try:
        done = fn(order.pk)
    except (services.FoodError, ledger.LedgerError) as exc:
        raise HttpError(422, str(exc))
    return _order(_orders_qs().get(pk=done.pk))


@router.post("/orders/{reference}/confirm", response=OrderOut, auth=JWTAuth())
def confirm_delivery(request, reference: str):
    return _run(services.customer_confirm, _own_order(request, reference))


@router.post("/orders/{reference}/cancel", response=OrderOut, auth=JWTAuth())
def cancel_order(request, reference: str):
    return _run(services.customer_cancel, _own_order(request, reference))


# ---- reservations -----------------------------------------------------------

@router.post("/reservations", response={201: ReservationOut}, auth=JWTAuth(),
             throttle=[user_throttle("food_reservation", "30/h")])
def create_reservation(request, payload: ReservationIn):
    try:
        restaurant = _listed().get(slug=payload.restaurant)
    except Restaurant.DoesNotExist:
        raise HttpError(404, "Restaurant not found.")
    when = timezone.make_aware(dt.datetime.combine(payload.date, payload.time))
    if when < timezone.now():
        raise HttpError(422, "Pick a date and time in the future.")
    r = Reservation.objects.create(
        reference=f"RES-{uuid.uuid4().hex[:8].upper()}", user=request.auth, restaurant=restaurant,
        date=payload.date, time=payload.time, guests=payload.guests, note=payload.note.strip(),
    )
    return 201, _reservation(r)


@router.get("/reservations", response=list[ReservationOut], auth=JWTAuth())
def my_reservations(request):
    qs = Reservation.objects.filter(user=request.auth).select_related("restaurant").order_by("-date", "-time")[:50]
    return [_reservation(r) for r in qs]


@router.post("/reservations/{reference}/cancel", response=ReservationOut, auth=JWTAuth())
def cancel_reservation(request, reference: str):
    try:
        r = Reservation.objects.select_related("restaurant").get(reference=reference, user=request.auth)
    except Reservation.DoesNotExist:
        raise HttpError(404, "Reservation not found.")
    r.status = Reservation.Status.CANCELLED
    r.save(update_fields=["status"])
    return _reservation(r)


# ---- vendor (restaurant owner) ---------------------------------------------

def _store(request) -> Restaurant:
    store = Restaurant.objects.filter(owner=request.auth).order_by("id").first()
    if store is None:
        # 403 is how the vendor dashboard knows to send the user to the vendor sign-up form.
        raise HttpError(403, "You don't have a restaurant on theKapita yet.")
    return store


def _unique_slug(name):
    base = slugify(name)[:100] or "restaurant"
    slug = base
    while Restaurant.objects.filter(slug=slug).exists():
        slug = f"{base}-{uuid.uuid4().hex[:4]}"
    return slug


@router.get("/vendor/me", response=VendorOut, auth=JWTAuth())
def vendor_me(request):
    store = _store(request)
    return {**_restaurant(store), "is_active": store.is_active}


@router.get("/vendor/summary", response=VendorSummaryOut, auth=JWTAuth())
def vendor_summary(request):
    store = _store(request)
    start = timezone.make_aware(dt.datetime.combine(timezone.localdate(), dt.time.min))
    orders = FoodOrder.objects.filter(restaurant=store)
    today = orders.filter(created_at__gte=start)
    dead = [FoodOrder.Status.DECLINED, FoodOrder.Status.CANCELLED]
    sales = today.exclude(status__in=dead).aggregate(s=Sum("total"))["s"] or 0
    wallet, _ = Wallet.objects.get_or_create(user=request.auth)
    return {
        "sales_today": float(sales),
        "active_orders": orders.filter(status__in=[
            FoodOrder.Status.INCOMING, FoodOrder.Status.PREPARING,
            FoodOrder.Status.DISPATCH, FoodOrder.Status.HANDED_OVER]).count(),
        "completed_today": today.filter(status=FoodOrder.Status.COMPLETED).count(),
        "balance": float(wallet.balance),
    }


@router.post("/vendor/register", response={201: VendorOut}, auth=JWTAuth(), throttle=[user_throttle("food_vendor_register", "10/h")])
def vendor_register(request, payload: VendorRegisterIn):
    from django.conf import settings
    if payload.category not in Restaurant.Category.values:
        raise HttpError(422, "Choose a supported store category.")
    if Restaurant.objects.filter(owner=request.auth).exists():
        raise HttpError(409, "You already have a restaurant on theKapita.")
    store = Restaurant.objects.create(
        owner=request.auth, name=payload.name.strip(), slug=_unique_slug(payload.name),
        category=payload.category, address=payload.address.strip(), phone=payload.phone.strip(),
        is_active=settings.FOOD_AUTO_APPROVE,
    )
    return 201, {**_restaurant(store), "is_active": store.is_active}


@router.patch("/vendor/store", response=VendorOut, auth=JWTAuth())
def vendor_update_store(request, payload: StoreUpdateIn):
    store = _store(request)
    data = payload.dict(exclude_unset=True)
    if "category" in data and data["category"] not in Restaurant.Category.values:
        raise HttpError(422, "Choose a supported store category.")
    if ("latitude" in data) != ("longitude" in data):
        raise HttpError(422, "Send both latitude and longitude to pin the store on the map.")
    for field, value in data.items():
        if value is None:
            continue
        setattr(store, field, value.strip() if isinstance(value, str) else value)
    store.save()
    return {**_restaurant(store), "is_active": store.is_active}


@router.get("/vendor/menu", response=list[MenuItemOut], auth=JWTAuth())
def vendor_menu(request):
    return [_menu_item(m) for m in _store(request).items.all()]


@router.post("/vendor/menu", response={201: MenuItemOut}, auth=JWTAuth())
def vendor_add_dish(request, payload: MenuItemIn):
    store = _store(request)
    item = MenuItem.objects.create(restaurant=store, **{
        **payload.dict(), "name": payload.name.strip(), "category": payload.category.strip(),
    })
    return 201, _menu_item(item)


@router.patch("/vendor/menu/{item_id}", response=MenuItemOut, auth=JWTAuth())
def vendor_update_dish(request, item_id: int, payload: MenuItemUpdateIn):
    store = _store(request)
    try:
        item = store.items.get(pk=item_id)
    except MenuItem.DoesNotExist:
        raise HttpError(404, "Menu item not found.")
    for field, value in payload.dict(exclude_unset=True).items():
        if value is not None:
            setattr(item, field, value.strip() if isinstance(value, str) else value)
    item.save()
    return _menu_item(item)


@router.get("/vendor/orders", response=list[OrderOut], auth=JWTAuth())
def vendor_orders(request, limit: int = 50):
    store = _store(request)
    active = [FoodOrder.Status.INCOMING, FoodOrder.Status.PREPARING,
              FoodOrder.Status.DISPATCH, FoodOrder.Status.HANDED_OVER]
    qs = _orders_qs().filter(restaurant=store, status__in=active)[: max(1, min(limit, 100))]
    return [_order(o) for o in qs]


@router.post("/vendor/orders/{reference}/status", response=OrderOut, auth=JWTAuth())
def vendor_order_status(request, reference: str, payload: VendorStatusIn):
    store = _store(request)
    try:
        order = FoodOrder.objects.get(reference=reference, restaurant=store)
    except FoodOrder.DoesNotExist:
        raise HttpError(404, "Order not found.")
    if payload.status not in FoodOrder.Status.values:
        raise HttpError(422, "Unknown status.")
    return _run(lambda pk: services.vendor_set_status(pk, payload.status), order)


# ---- vendor photos (uploaded straight to private storage; see directory/uploads.py) --------------------

class ImageUploadIn(Schema):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=50)
    size: int = Field(gt=0, le=uploads.MAX_IMAGE_BYTES)


class ImageKeyIn(Schema):
    key: str = Field(min_length=1, max_length=512)


def _dish(request, item_id):
    try:
        return _store(request).items.get(pk=item_id)
    except MenuItem.DoesNotExist:
        raise HttpError(404, "Menu item not found.")


def _photo_result(obj):
    return {"image_key": obj.image_key, "image_url": image_storage.image_url_for(obj.image_key) or obj.image_url or None}


def _set_photo(obj, key):
    previous = obj.image_key
    obj.image_key = key
    obj.save(update_fields=["image_key"])
    if previous and previous != key:
        image_storage.delete_object(previous)
    return _photo_result(obj)


@router.post("/vendor/store/image/upload-url", auth=JWTAuth(), throttle=[user_throttle("food_store_img_url", "30/h")])
def store_image_upload_url(request, payload: ImageUploadIn):
    store = _store(request)
    return uploads.issue_upload(f"food/restaurants/{store.id}", payload.filename, payload.content_type, payload.size)


@router.post("/vendor/store/image", auth=JWTAuth(), throttle=[user_throttle("food_store_img_ok", "30/h")])
def store_image_confirm(request, payload: ImageKeyIn):
    store = _store(request)
    return _set_photo(store, uploads.verify_upload(f"food/restaurants/{store.id}", payload.key))


@router.delete("/vendor/store/image", auth=JWTAuth())
def store_image_delete(request):
    store = _store(request)
    return _set_photo(store, "")


@router.post("/vendor/menu/{item_id}/image/upload-url", auth=JWTAuth(), throttle=[user_throttle("food_dish_img_url", "60/h")])
def dish_image_upload_url(request, item_id: int, payload: ImageUploadIn):
    item = _dish(request, item_id)
    return uploads.issue_upload(f"food/menu/{item.id}", payload.filename, payload.content_type, payload.size)


@router.post("/vendor/menu/{item_id}/image", auth=JWTAuth(), throttle=[user_throttle("food_dish_img_ok", "60/h")])
def dish_image_confirm(request, item_id: int, payload: ImageKeyIn):
    item = _dish(request, item_id)
    return _set_photo(item, uploads.verify_upload(f"food/menu/{item.id}", payload.key))


@router.delete("/vendor/menu/{item_id}/image", auth=JWTAuth())
def dish_image_delete(request, item_id: int):
    return _set_photo(_dish(request, item_id), "")


# ---- delivery estimate by road (uses the routing service, i.e. OSRM / TomTom) ----------------------------

class DeliveryEstimateOut(Schema):
    distance_km: float
    minutes: int          # travel time only: add the restaurant's preparation time yourself
    source: str           # "road" or "estimate" (straight line, used when no road route is available)
    traffic: bool
    provider: str


@router.get("/restaurants/{slug}/delivery-estimate", response=DeliveryEstimateOut, auth=JWTAuth(),
            throttle=[user_throttle("food_eta", "60/m")])
def delivery_estimate(request, slug: str, lat: float, lng: float):
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HttpError(422, "lat and lng must be valid coordinates.")
    try:
        store = _listed().get(slug=slug)
    except Restaurant.DoesNotExist:
        raise HttpError(404, "Restaurant not found.")
    if store.latitude is None or store.longitude is None:
        raise HttpError(422, "This restaurant has not pinned its location yet.")
    try:
        route = routing.get_route((store.latitude, store.longitude), (lat, lng))
        return {"distance_km": route.distance_km, "minutes": max(1, round(route.duration_min)) if route.distance_km else 0,
                "source": "road", "traffic": route.traffic, "provider": route.provider}
    except routing.RoutingError:
        km = _haversine_km(store.latitude, store.longitude, lat, lng)
        # Straight line is shorter than the road; ~30% longer at ~30 km/h is a sensible city rule of thumb.
        return {"distance_km": round(km, 2), "minutes": max(1, round(km * 1.3 / 30 * 60)) if km > 0.02 else 0,
                "source": "estimate", "traffic": False, "provider": "none"}
