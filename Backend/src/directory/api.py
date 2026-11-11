import math
import re

from django.conf import settings
from django.db import IntegrityError
from django.db.models import Avg, Count, Q
from ninja import Field, Router, Schema
from ninja.errors import HttpError

from app.auth import JWTAuth
from app.throttles import user_throttle

from .models import Bookmark, Listing, Report, Review

router = Router()

REPORT_ISSUES = (
    "Phone Number Disconnected / Changed",
    "Business Permanently Closed",
    "Incorrect Operating Hours",
    "Duplicate Listing Record",
)


# ---- schemas ----------------------------------------------------------------

class ListingOut(Schema):
    id: int
    name: str
    category: str
    category_label: str
    description: str = ""
    address: str
    city: str = ""
    phone: str
    hours: str = ""
    services: list[str]
    tier: str
    is_verified: bool
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


def _listing(l, near=None):
    dist = None
    if near and l.latitude is not None and l.longitude is not None:
        dist = round(_haversine_km(near[0], near[1], l.latitude, l.longitude), 2)
    avg = getattr(l, "avg_rating", None)
    return {
        "id": l.id, "name": l.name, "category": l.category, "category_label": l.get_category_display(),
        "description": l.description, "address": l.address, "city": l.city, "phone": l.phone,
        "hours": l.hours, "services": l.services or [], "tier": l.tier, "is_verified": l.is_verified,
        "latitude": l.latitude, "longitude": l.longitude,
        "rating": round(avg, 1) if avg is not None else None,
        "review_count": getattr(l, "n_reviews", 0) or 0,
        "distance_km": dist,
    }


def _order(rows, near):
    """Sponsored first, then nearest (when we know where the user is), then A-Z."""
    def key(l):
        d = _haversine_km(near[0], near[1], l.latitude, l.longitude) if (
            near and l.latitude is not None and l.longitude is not None) else float("inf")
        return (l.tier != Listing.Tier.SPONSORED, d, l.name.lower())
    return sorted(rows, key=key)


# Rule-based intent parsing (keywords -> category). No LLM involved; swap parse_intent() for one later.
CATEGORY_WORDS = {
    Listing.Category.HOSPITALS: {"hospital", "hospitals", "clinic", "clinics", "doctor", "pharmacy", "health", "medical", "dentist"},
    Listing.Category.SCHOOLS: {"school", "schools", "university", "college", "institute", "academy", "education"},
    Listing.Category.GOVERNMENT: {"government", "ministry", "agency", "police", "immigration", "passport", "council", "tax", "office"},
    Listing.Category.BUSINESSES: {"business", "businesses", "shop", "store", "company", "bank", "market"},
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
    rows = _order(list(qs[:500]), near)[offset: offset + limit]
    return [_listing(l, near) for l in rows]


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
    return {"intent": intent, "results": [_listing(l, near) for l in _order(list(qs[:200]), near)[:60]]}


@router.get("/listings/{listing_id}", response=ListingDetailOut)
def get_listing(request, listing_id: int):
    l = _approved().filter(pk=listing_id).first()
    if l is None:
        raise HttpError(404, "Listing not found.")
    reviews = [
        {"id": r.id, "author": r.user.first_name or "Kapita user", "rating": r.rating,
         "comment": r.comment, "created_at": r.created_at.isoformat()}
        for r in l.reviews.select_related("user")[:30]
    ]
    return {**_listing(l), "reviews": reviews}


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
