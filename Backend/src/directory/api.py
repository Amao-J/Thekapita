import math
import re

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.db import IntegrityError
from django.db.models import Avg, Case, Count, ExpressionWrapper, F, FloatField, IntegerField, Q, Value, When
from django.db.models.functions import Coalesce
from ninja import Field, Router, Schema
from ninja.errors import HttpError

from app.auth import JWTAuth
from app.throttles import user_throttle

from . import storage
from .models import Bookmark, Listing, Report, Review

router = Router()


class OptionalJWTAuth(JWTAuth):
    def __call__(self, request):
        if not request.headers.get("Authorization"):
            return AnonymousUser()
        return super().__call__(request)


REPORT_ISSUES = (
    "Phone Number Disconnected / Changed",
    "Business Permanently Closed",
    "Incorrect Operating Hours",
    "Duplicate Listing Record",
)
MAX_LISTING_IMAGE_BYTES = storage.MAX_IMAGE_BYTES
LISTING_IMAGE_TYPES = {
    "image/jpeg": {"jpg", "jpeg"},
    "image/png": {"png"},
    "image/webp": {"webp"},
}


# ---- schemas ----------------------------------------------------------------

class ListingOut(Schema):
    id: int
    name: str
    category: str
    category_label: str
    description: str = ""
    address: str
    image_url: str | None = None
    can_upload_image: bool = False
    city: str = ""
    phone: str
    hours: str = ""
    services: list[str]
    tier: str
    is_verified: bool
    attribution: str | None = None   # credit line the provider's licence requires us to show
    latitude: float | None = None
    longitude: float | None = None
    rating: float | None = None
    review_count: int = 0
    distance_km: float | None = None


class ReviewOut(Schema):
    id: int
    author: str
    rating: int
    comment: str = ""
    created_at: str


class ListingDetailOut(ListingOut):
    reviews: list[ReviewOut]


class MyListingOut(ListingOut):
    status: str
    status_label: str
    bookmark_count: int = 0


class ListingIn(Schema):
    name: str = Field(min_length=2, max_length=150)
    category: str
    phone: str = Field(min_length=7, max_length=30)
    address: str = Field(min_length=3, max_length=255)
    tier: str = "standard"
    description: str = Field("", max_length=400)
    hours: str = Field("", max_length=120)
    city: str = Field("", max_length=80)
    services: list[str] = Field(default_factory=list, max_length=15)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)


class ReviewIn(Schema):
    rating: int = Field(ge=1, le=5)
    comment: str = Field("", max_length=500)


class ReportIn(Schema):
    listing_id: int
    issue_type: str = Field(max_length=80)
    notes: str = Field("", max_length=500)


class SearchOut(Schema):
    intent: dict
    results: list[ListingOut]


# ---- helpers ----------------------------------------------------------------

def _approved():
    return Listing.objects.filter(status=Listing.Status.APPROVED).annotate(
        avg_rating=Avg("reviews__rating"), n_reviews=Count("reviews", distinct=True)
    )


def _haversine_km(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def _listing(l, near=None, can_upload_image=False):
    dist = None
    if near and l.latitude is not None and l.longitude is not None:
        dist = round(_haversine_km(near[0], near[1], l.latitude, l.longitude), 2)
    avg = getattr(l, "avg_rating", None)
    return {
        "id": l.id, "name": l.name, "category": l.category, "category_label": l.get_category_display(),
        "description": l.description, "address": l.address,
        "image_url": l.image_url,
        "can_upload_image": can_upload_image,
        "city": l.city, "phone": l.phone,
        "hours": l.hours, "services": l.services or [], "tier": l.tier, "is_verified": l.is_verified,
        "attribution": ATTRIBUTION.get(l.source),
        "latitude": l.latitude, "longitude": l.longitude,
        "rating": round(avg, 1) if avg is not None else None,
        "review_count": getattr(l, "n_reviews", 0) or 0,
        "distance_km": dist,
    }


ATTRIBUTION = {Listing.Source.OSM: "\u00A9 OpenStreetMap contributors"}

def _ranked(qs, near, limit, offset):
    """One page of results, ranked entirely in the database so paging and 'nearest' stay correct with any number
    of rows: sponsored first, then closest to the person (rows with no position last), then A-Z.

    Distance here is only for ordering (a flat-earth approximation, plenty accurate at city/country scale);
    the distance_km shown to the person is computed exactly for the rows on the page."""
    sponsor = Case(When(tier=Listing.Tier.SPONSORED, then=0), default=1, output_field=IntegerField())
    if near:
        lat, lng = near
        dlat = F("latitude") - lat
        dlng = (F("longitude") - lng) * math.cos(math.radians(lat))
        d2 = Coalesce(
            ExpressionWrapper(dlat * dlat + dlng * dlng, output_field=FloatField()),
            Value(1e9, output_field=FloatField()),
        )
        qs = qs.annotate(sponsor_rank=sponsor, dist2=d2).order_by("sponsor_rank", "dist2", "name", "id")
    else:
        qs = qs.annotate(sponsor_rank=sponsor).order_by("sponsor_rank", "name", "id")
    return list(qs[offset: offset + limit])


# Rule-based intent parsing (keywords -> category). No LLM involved; swap parse_intent() for one later.
CATEGORY_WORDS = {
    Listing.Category.HOSPITALS: {"hospital", "hospitals", "clinic", "clinics", "doctor", "pharmacy", "health", "medical", "dentist"},
    Listing.Category.SCHOOLS: {"school", "schools", "university", "college", "institute", "academy", "education"},
    Listing.Category.GOVERNMENT: {"government", "ministry", "agency", "police", "immigration", "passport", "council", "tax", "office"},
    Listing.Category.BUSINESSES: {"business", "businesses", "shop", "store", "company", "bank", "market"},
    Listing.Category.RESTAURANTS: {"restaurant", "restaurants", "eatery", "cafe", "cafes", "buka", "bukateria", "suya",
                                   "food", "diner", "lunch", "dinner", "breakfast"},
}
STOP = {"a", "an", "the", "in", "near", "me", "open", "now", "find", "show", "for", "and", "of", "at", "to", "any", "best"}


def parse_intent(q: str) -> dict:
    words = re.findall(r"[a-z0-9']+", q.lower())
    category = next((c for c, vocab in CATEGORY_WORDS.items() if any(w in vocab for w in words)), None)
    keywords = [w for w in words if w not in STOP and not any(w in v for v in CATEGORY_WORDS.values())]
    return {"category": category.value if category else None, "keywords": keywords}


def _near(lat, lng):
    return (lat, lng) if lat is not None and lng is not None else None


# ---- public -----------------------------------------------------------------

@router.get("/listings", response=list[ListingOut])
def list_listings(request, category: str | None = None, q: str | None = None,
                  lat: float | None = None, lng: float | None = None, limit: int = 60, offset: int = 0):
    qs = _approved()
    if category and category.lower() != "all":
        qs = qs.filter(category=category.lower())
    if q and q.strip():
        n = q.strip()
        qs = qs.filter(Q(name__icontains=n) | Q(description__icontains=n) | Q(address__icontains=n))
    limit, offset = max(1, min(limit, 100)), max(offset, 0)
    near = _near(lat, lng)
    return [_listing(l, near) for l in _ranked(qs, near, limit, offset)]


@router.get("/search", response=SearchOut)
def search(request, q: str, lat: float | None = None, lng: float | None = None):
    intent = parse_intent(q[:200])
    qs = _approved()
    if intent["category"]:
        qs = qs.filter(category=intent["category"])
    if intent["keywords"]:
        cond = Q()
        for w in intent["keywords"][:6]:
            cond |= Q(name__icontains=w) | Q(description__icontains=w) | Q(address__icontains=w)
        qs = qs.filter(cond)
    near = _near(lat, lng)
    return {"intent": intent, "results": [_listing(l, near) for l in _ranked(qs, near, 60, 0)]}


@router.get("/listings/{listing_id}", response=ListingDetailOut, auth=OptionalJWTAuth())
def get_listing(request, listing_id: int):
    l = _approved().filter(pk=listing_id).first()
    if l is None:
        raise HttpError(404, "Listing not found.")
    reviews = [
        {"id": r.id, "author": r.user.first_name or "Kapita user", "rating": r.rating,
         "comment": r.comment, "created_at": r.created_at.isoformat()}
        for r in l.reviews.select_related("user")[:30]
    ]
    user = request.auth
    can_upload_image = bool(
        user and user.is_authenticated and (user.is_staff or l.owner_id == user.id)
    )
    return {**_listing(l, can_upload_image=can_upload_image), "reviews": reviews}


class ListingImageUploadIn(Schema):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=50)
    size: int = Field(gt=0, le=MAX_LISTING_IMAGE_BYTES)


class ListingImageKeyIn(Schema):
    key: str = Field(min_length=1, max_length=512)


def _image_upload_listing(listing_id, user):
    listing = Listing.objects.filter(pk=listing_id).first()
    if listing is None:
        raise HttpError(404, "Listing not found.")
    if listing.owner_id != user.id and not user.is_staff:
        raise HttpError(403, "Only the listing owner or directory staff can upload a photo.")
    return listing


@router.post("/listings/{listing_id}/image/upload-url", auth=JWTAuth(),
             throttle=[user_throttle("dir_image_url", "20/h")])
def create_listing_image_upload(request, listing_id: int, payload: ListingImageUploadIn):
    listing = _image_upload_listing(listing_id, request.auth)
    extensions = LISTING_IMAGE_TYPES.get(payload.content_type)
    extension = payload.filename.rsplit(".", 1)[-1].lower() if "." in payload.filename else ""
    if extensions is None or extension not in extensions:
        raise HttpError(422, "Upload a JPEG, PNG, or WebP image with a matching file extension.")

    key = f"directory/listings/{listing.id}/photo"
    try:
        upload = storage.generate_presigned_upload(key, payload.content_type)
    except storage.S3ImageStorageError as exc:
        raise HttpError(503, str(exc)) from exc
    return {"key": key, "upload_url": upload["url"], "fields": upload["fields"]}


@router.post("/listings/{listing_id}/image", auth=JWTAuth(),
             throttle=[user_throttle("dir_image_confirm", "20/h")])
def confirm_listing_image_upload(request, listing_id: int, payload: ListingImageKeyIn):
    listing = _image_upload_listing(listing_id, request.auth)
    expected_key = f"directory/listings/{listing.id}/photo"
    if payload.key != expected_key:
        raise HttpError(422, "The image key was not issued for this listing.")

    try:
        image = storage.inspect_uploaded_image(payload.key)
    except storage.S3ImageStorageError as exc:
        raise HttpError(503, str(exc)) from exc
    if image is None:
        raise HttpError(422, "Upload the image to private storage before saving its key.")
    if image["content_type"] not in LISTING_IMAGE_TYPES or not 0 < image["size"] <= MAX_LISTING_IMAGE_BYTES:
        raise HttpError(422, "The stored image must be a JPEG, PNG, or WebP no larger than 8 MB.")

    listing.image_key = payload.key
    listing.save(update_fields=["image_key", "updated_at"])
    try:
        image_url = listing.image_url
    except storage.S3ImageStorageError as exc:
        raise HttpError(503, str(exc)) from exc
    return {"id": listing.id, "image_key": listing.image_key, "image_url": image_url}


# ---- signed-in actions -------------------------------------------------------

@router.post("/listings", response={201: MyListingOut}, auth=JWTAuth(), throttle=[user_throttle("dir_listing", "20/h")])
def create_listing(request, payload: ListingIn):
    if payload.category not in Listing.Category.values:
        raise HttpError(422, "Choose a supported category.")
    if payload.tier not in Listing.Tier.values:
        raise HttpError(422, "Choose a supported listing tier.")
    l = Listing.objects.create(
        owner=request.auth, name=payload.name.strip(), category=payload.category, phone=payload.phone.strip(),
        address=payload.address.strip(), tier=payload.tier, description=payload.description.strip(),
        hours=payload.hours.strip(), city=payload.city.strip(),
        services=[s.strip()[:60] for s in payload.services if s.strip()],
        latitude=payload.latitude, longitude=payload.longitude,
        status=Listing.Status.APPROVED if settings.DIRECTORY_AUTO_APPROVE else Listing.Status.PENDING,
    )
    return 201, {**_listing(l), "status": l.status, "status_label": l.get_status_display(), "bookmark_count": 0}


@router.get("/mine", response=list[MyListingOut], auth=JWTAuth())
def my_listings(request):
    qs = (Listing.objects.filter(owner=request.auth)
          .annotate(avg_rating=Avg("reviews__rating"), n_reviews=Count("reviews", distinct=True),
                    n_bookmarks=Count("bookmarks", distinct=True)))
    return [
        {**_listing(l), "status": l.status, "status_label": l.get_status_display(), "bookmark_count": l.n_bookmarks}
        for l in qs
    ]


@router.post("/listings/{listing_id}/reviews", response={201: ReviewOut}, auth=JWTAuth(),
             throttle=[user_throttle("dir_review", "30/h")])
def post_review(request, listing_id: int, payload: ReviewIn):
    l = Listing.objects.filter(pk=listing_id, status=Listing.Status.APPROVED).first()
    if l is None:
        raise HttpError(404, "Listing not found.")
    if l.owner_id == request.auth.id:
        raise HttpError(422, "You can't review your own listing.")
    r, _ = Review.objects.update_or_create(
        listing=l, user=request.auth, defaults={"rating": payload.rating, "comment": payload.comment.strip()}
    )
    return 201, {"id": r.id, "author": request.auth.first_name or "Kapita user", "rating": r.rating,
                 "comment": r.comment, "created_at": r.created_at.isoformat()}


@router.get("/bookmarks", response=list[ListingOut], auth=JWTAuth())
def my_bookmarks(request):
    ids = Bookmark.objects.filter(user=request.auth).values_list("listing_id", flat=True)
    return [_listing(l) for l in _approved().filter(pk__in=list(ids))]


@router.post("/listings/{listing_id}/bookmark", auth=JWTAuth())
def toggle_bookmark(request, listing_id: int):
    l = Listing.objects.filter(pk=listing_id, status=Listing.Status.APPROVED).first()
    if l is None:
        raise HttpError(404, "Listing not found.")
    deleted, _ = Bookmark.objects.filter(listing=l, user=request.auth).delete()
    if deleted:
        return {"bookmarked": False}
    try:
        Bookmark.objects.create(listing=l, user=request.auth)
    except IntegrityError:  # double-tap race: it already exists, which is the state they wanted
        pass
    return {"bookmarked": True}


@router.post("/reports", response={201: dict}, auth=JWTAuth(), throttle=[user_throttle("dir_report", "20/h")])
def report_listing(request, payload: ReportIn):
    if payload.issue_type not in REPORT_ISSUES:
        raise HttpError(422, "Choose one of the listed issue types.")
    l = Listing.objects.filter(pk=payload.listing_id, status=Listing.Status.APPROVED).first()
    if l is None:
        raise HttpError(404, "Listing not found.")
    Report.objects.create(listing=l, user=request.auth, issue_type=payload.issue_type, notes=payload.notes.strip())
    return 201, {"status": "received"}
