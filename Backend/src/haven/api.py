"""Haven (real estate) API, mounted at /api/haven/.

Public:  GET  /properties, GET /properties/{id}
Signed in: GET /mine, POST /properties, PATCH /properties/{id}, DELETE /properties/{id},
           GET /bookmarks, POST|DELETE /properties/{id}/bookmark
New listings start as "pending" and go live after staff approval (or immediately when
HAVEN_AUTO_APPROVE=1, the default in DEBUG).
"""
from decimal import Decimal

from django.conf import settings
from django.db.models import F, Q
from ninja import Field, Router, Schema
from ninja.errors import HttpError
from ninja.throttling import UserRateThrottle

from app.auth import JWTAuth
from directory.storage import stored_file_url

from .models import Property, PropertyBookmark

router = Router()


class PropertyOut(Schema):
    id: int
    title: str
    description: str
    category: str
    category_label: str
    intent: str
    intent_label: str
    price: float
    price_period: str          # "", "year" or "night"
    negotiable: bool
    address: str
    city: str
    bedrooms: int
    bathrooms: int
    parking: int
    area_sqm: int | None = None
    image_url: str
    video_url: str | None = None
    title_doc: str
    title_doc_label: str
    title_verified: bool
    agent_verified: bool
    featured: bool
    status: str
    status_label: str
    is_mine: bool
    bookmarked: bool
    created_at: str


class PropertyIn(Schema):
    title: str = Field(..., min_length=3, max_length=150)
    description: str = Field("", max_length=4000)
    category: str = Property.Category.APARTMENT
    intent: str
    price: Decimal = Field(..., gt=0, lt=Decimal("100000000000"), decimal_places=2)
    negotiable: bool = False
    address: str = Field(..., min_length=3, max_length=255)
    city: str = Field(..., min_length=2, max_length=120)
    bedrooms: int = Field(0, ge=0, le=50)
    bathrooms: int = Field(0, ge=0, le=50)
    parking: int = Field(0, ge=0, le=50)
    area_sqm: int | None = Field(None, ge=1, le=10_000_000)
    image_url: str = Field("", max_length=500, pattern=r"^(https://\S+)?$")
    title_doc: str = Property.TitleDoc.COFO


class PropertyPatch(Schema):
    title: str | None = Field(None, min_length=3, max_length=150)
    description: str | None = Field(None, max_length=4000)
    category: str | None = None
    intent: str | None = None
    price: Decimal | None = Field(None, gt=0, lt=Decimal("100000000000"), decimal_places=2)
    negotiable: bool | None = None
    address: str | None = Field(None, min_length=3, max_length=255)
    city: str | None = Field(None, min_length=2, max_length=120)
    bedrooms: int | None = Field(None, ge=0, le=50)
    bathrooms: int | None = Field(None, ge=0, le=50)
    parking: int | None = Field(None, ge=0, le=50)
    area_sqm: int | None = Field(None, ge=1, le=10_000_000)
    image_url: str | None = Field(None, max_length=500, pattern=r"^(https://\S+)?$")
    title_doc: str | None = None


def _check_choices(data: dict):
    for field, choices in (("category", Property.Category), ("intent", Property.Intent), ("title_doc", Property.TitleDoc)):
        if data.get(field) is not None and data[field] not in choices.values:
            raise HttpError(422, f"Invalid {field}. Use one of: {', '.join(choices.values)}.")


def _user(request):
    """Optional auth on public endpoints: returns the user when a valid Bearer token is sent."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return JWTAuth().authenticate(request, header[7:])


def _out(p: Property, user=None, bookmarked_ids=frozenset(), request=None):
    return {
        "id": p.id, "title": p.title, "description": p.description,
        "category": p.category, "category_label": p.get_category_display(),
        "intent": p.intent, "intent_label": p.get_intent_display(),
        "price": float(p.price), "price_period": p.price_period, "negotiable": p.negotiable,
        "address": p.address, "city": p.city,
        "bedrooms": p.bedrooms, "bathrooms": p.bathrooms, "parking": p.parking, "area_sqm": p.area_sqm,
        "image_url": stored_file_url(p.image_file, request) or p.image_url,
        "video_url": stored_file_url(p.video_file, request),
        "title_doc": p.title_doc, "title_doc_label": p.get_title_doc_display(),
        "title_verified": p.title_verified, "agent_verified": p.agent_verified,
        "featured": p.featured, "status": p.status, "status_label": p.get_status_display(),
        "is_mine": bool(user and p.owner_id == user.id),
        "bookmarked": p.id in bookmarked_ids,
        "created_at": p.created_at.isoformat(),
    }


def _bookmarked_ids(user):
    return set(PropertyBookmark.objects.filter(user=user).values_list("property_id", flat=True)) if user else set()


def _initial_status():
    return Property.Status.APPROVED if getattr(settings, "HAVEN_AUTO_APPROVE", False) else Property.Status.PENDING


def _own(request, property_id) -> Property:
    try:
        return Property.objects.get(pk=property_id, owner=request.auth)
    except Property.DoesNotExist:
        raise HttpError(404, "Property not found.")


# ---- public ----------------------------------------------------------------

@router.get("/properties", response=list[PropertyOut])
def list_properties(request, intent: str | None = None, category: str | None = None, q: str | None = None,
                    city: str | None = None, min_price: float | None = None, max_price: float | None = None,
                    bedrooms: int | None = None, featured: bool | None = None, limit: int = 60, offset: int = 0):
    """GET /api/haven/properties?intent=rent&max_price=5000000&bedrooms=2 - live listings only."""
    qs = Property.objects.filter(status=Property.Status.APPROVED)
    if intent and intent != "all":
        qs = qs.filter(intent=intent)
    if category:
        qs = qs.filter(category=category)
    if city:
        qs = qs.filter(city__icontains=city.strip())
    if q and q.strip():
        term = q.strip()
        qs = qs.filter(Q(title__icontains=term) | Q(city__icontains=term) | Q(address__icontains=term))
    if min_price is not None:
        qs = qs.filter(price__gte=min_price)
    if max_price is not None:
        qs = qs.filter(price__lte=max_price)
    if bedrooms is not None:
        qs = qs.filter(bedrooms__gte=bedrooms)
    if featured:
        qs = qs.filter(featured=True)
    limit, offset = max(1, min(limit, 100)), max(offset, 0)
    user = _user(request)
    marked = _bookmarked_ids(user)
    return [_out(p, user, marked, request) for p in qs[offset: offset + limit]]


@router.get("/properties/{property_id}", response=PropertyOut)
def get_property(request, property_id: int):
    user = _user(request)
    try:
        p = Property.objects.get(pk=property_id)
    except Property.DoesNotExist:
        raise HttpError(404, "Property not found.")
    if p.status != Property.Status.APPROVED and not (user and p.owner_id == user.id):
        raise HttpError(404, "Property not found.")
    if p.status == Property.Status.APPROVED and not (user and p.owner_id == user.id):
        Property.objects.filter(pk=p.pk).update(views=F("views") + 1)
    return _out(p, user, _bookmarked_ids(user), request)


# ---- owner / agent -----------------------------------------------------------

@router.get("/mine", response=list[PropertyOut], auth=JWTAuth())
def my_properties(request):
    """Every property the caller listed, including pending and rejected ones."""
    marked = _bookmarked_ids(request.auth)
    qs = Property.objects.filter(owner=request.auth).exclude(status=Property.Status.ARCHIVED)
    return [_out(p, request.auth, marked, request) for p in qs.order_by("-created_at")]


@router.post("/properties", response={201: PropertyOut}, auth=JWTAuth(), throttle=[UserRateThrottle("30/h")])
def create_property(request, payload: PropertyIn):
    """Add an apartment/house/land for rent, sale or short-let."""
    data = payload.dict()
    _check_choices(data)
    p = Property.objects.create(owner=request.auth, status=_initial_status(), **data)
    return 201, _out(p, request.auth, request=request)


@router.patch("/properties/{property_id}", response=PropertyOut, auth=JWTAuth())
def update_property(request, property_id: int, payload: PropertyPatch):
    p = _own(request, property_id)
    if p.status == Property.Status.ARCHIVED:
        raise HttpError(404, "Property not found.")
    changes = payload.dict(exclude_unset=True, exclude_none=True)
    _check_choices(changes)
    for field, value in changes.items():
        setattr(p, field, value)
    if "title_doc" in changes:
        p.title_verified = False  # a different document needs a fresh audit
    p.save()
    return _out(p, request.auth, _bookmarked_ids(request.auth), request)


@router.delete("/properties/{property_id}", response={204: None}, auth=JWTAuth())
def archive_property(request, property_id: int):
    """Soft delete: the listing disappears everywhere but stays in the database."""
    p = _own(request, property_id)
    p.status = Property.Status.ARCHIVED
    p.save(update_fields=["status", "updated_at"])
    return 204, None


# ---- bookmarks ---------------------------------------------------------------

@router.get("/bookmarks", response=list[PropertyOut], auth=JWTAuth())
def my_bookmarks(request):
    qs = Property.objects.filter(bookmarks__user=request.auth, status=Property.Status.APPROVED)
    marked = _bookmarked_ids(request.auth)
    return [_out(p, request.auth, marked, request) for p in qs.order_by("-bookmarks__created_at")]


@router.post("/properties/{property_id}/bookmark", auth=JWTAuth())
def add_bookmark(request, property_id: int):
    try:
        p = Property.objects.get(pk=property_id, status=Property.Status.APPROVED)
    except Property.DoesNotExist:
        raise HttpError(404, "Property not found.")
    PropertyBookmark.objects.get_or_create(user=request.auth, property=p)
    return {"bookmarked": True}


@router.delete("/properties/{property_id}/bookmark", auth=JWTAuth())
def remove_bookmark(request, property_id: int):
    PropertyBookmark.objects.filter(user=request.auth, property_id=property_id).delete()
    return {"bookmarked": False}
