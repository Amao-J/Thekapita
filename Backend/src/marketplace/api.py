from django.db import IntegrityError, transaction
from django.http import JsonResponse
from ninja import Field, Router, Schema
from ninja.errors import HttpError
from ninja.throttling import AnonRateThrottle

from app.auth import JWTAuth
from app.idempotency import IdempotencyConflict, get_or_create_idempotent_response

from . import services
from .media import PUBLIC_PREFIXES, generate_presigned_url, signed_url
from .models import Category, Order, Product

router = Router()


# ---- schemas ---------------------------------------------------------------

class ProductOut(Schema):
    id: int
    slug: str
    title: str
    short_description: str = ""
    price: float
    compare_price: float | None = None
    category: str            # category slug, what the page filters on
    category_label: str
    image_url: str | None = None
    gallery: list[str] = []
    seller_name: str
    is_verified: bool
    in_stock: bool
    stock: int
    badge: str = ""
    rating: float | None = None        # no reviews model yet
    review_count: int | None = None


class CategoryOut(Schema):
    slug: str
    name: str
    image_url: str | None = None


class OrderItemIn(Schema):
    id: int
    qty: int = Field(1, ge=1, le=50)


class DeliveryIn(Schema):
    full_name: str = Field("", max_length=150)
    phone: str = Field("", max_length=30)
    address: str = Field("", max_length=255)
    city: str = Field("", max_length=100)
    state: str = Field("", max_length=100)


class OrderCreateIn(Schema):
    items: list[OrderItemIn] = Field(..., min_length=1, max_length=50)
    delivery: DeliveryIn | None = None


class OrderItemOut(Schema):
    product_id: int
    name: str
    unit_price: float
    qty: int


class OrderOut(Schema):
    reference: str
    status: str
    status_label: str
    seller_name: str
    total: float
    created_at: str
    items: list[OrderItemOut]


def _product(p, request, with_gallery=False):
    return {
        "id": p.id, "slug": p.slug, "title": p.name, "short_description": p.short_description,
        "price": float(p.price), "compare_price": float(p.compare_price) if p.compare_price else None,
        "category": p.category.slug, "category_label": p.category.name,
        "image_url": signed_url(p.image_key, request),
        "gallery": [signed_url(g.image_key, request) for g in p.gallery_images.all()] if with_gallery else [],
        "seller_name": p.seller.store_name, "is_verified": p.seller.is_verified,
        "in_stock": p.in_stock, "stock": p.stock, "badge": p.badge,
    }


def _order(o):
    return {
        "reference": o.reference, "status": o.status, "status_label": o.get_status_display(),
        "seller_name": o.seller.store_name, "total": float(o.total), "created_at": o.created_at.isoformat(),
        "items": [{"product_id": i.product_id, "name": i.name, "unit_price": float(i.unit_price), "qty": i.qty}
                  for i in o.items.all()],
    }


def _catalog():
    return Product.objects.filter(is_active=True, seller__is_active=True).select_related("category", "seller")


# ---- catalog (public) ------------------------------------------------------

@router.get("/products", response=list[ProductOut])
def list_products(request, category: str | None = None, q: str | None = None,
                  featured: bool | None = None, limit: int = 60, offset: int = 0):
    qs = _catalog()
    if category and category != "all":
        qs = qs.filter(category__slug=category)
    if q:
        qs = qs.filter(name__icontains=q.strip())
    if featured:
        qs = qs.filter(featured=True)
    limit, offset = max(1, min(limit, 100)), max(offset, 0)
    return [_product(p, request) for p in qs[offset: offset + limit]]


@router.get("/products/{product_id}", response=ProductOut)
def get_product(request, product_id: int):
    try:
        p = _catalog().prefetch_related("gallery_images").get(pk=product_id)
    except Product.DoesNotExist:
        raise HttpError(404, "Product not found.")
    return _product(p, request, with_gallery=True)


@router.get("/categories", response=list[CategoryOut])
def list_categories(request):
    return [{"slug": c.slug, "name": c.name, "image_url": c.image_url} for c in Category.objects.all()]


@router.get("/presign", throttle=[AnonRateThrottle("60/m")])
def presign(request, key: str = ""):
    """GET /api/marketplace/presign?key=marketplace/products/2026/10/oud.jpg
    Fresh presigned URL for one catalog image (lazy-loading from JS). Only keys under
    marketplace/products/ and marketplace/categories/ can be signed."""
    key = key.strip()
    if not key:
        return JsonResponse({"error": "key parameter is required."}, status=400)
    if ".." in key or key.startswith("/") or not key.startswith(PUBLIC_PREFIXES):
        return JsonResponse({"error": "Invalid key."}, status=400)
    url = generate_presigned_url(key)
    if url:
        return JsonResponse({"url": url})
    return JsonResponse({"error": "Could not generate URL. Is the bucket configured?"}, status=503)


# ---- orders (auth) ---------------------------------------------------------

@router.post("/orders", auth=JWTAuth())
def create_orders(request, payload: OrderCreateIn):
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise HttpError(400, "Idempotency-Key header is required for this endpoint.")
    user = request.auth

    def do_place():
        d = payload.delivery.dict() if payload.delivery else {}
        profile = getattr(user, "profile", None)
        delivery = {
            "full_name": d.get("full_name") or user.first_name,
            "phone": d.get("phone") or (profile.phone if profile else ""),
            "address": d.get("address") or (profile.address if profile else ""),
            "city": d.get("city", ""), "state": d.get("state", ""),
        }
        try:
            orders = services.place_orders(user, [(i.id, i.qty) for i in payload.items], delivery)
        except services.MarketError as exc:
            return 422, {"detail": str(exc)}
        return 201, {"orders": [_order(o) for o in orders], "balance": str(user.wallet.balance)}

    try:
        with transaction.atomic():  # an idempotency-insert race rolls the ledger writes back too
            status_code, body = get_or_create_idempotent_response(
                key=key, user_id=user.id, body=payload.dict(), compute=do_place,
            )
    except IdempotencyConflict as exc:
        raise HttpError(409, str(exc))
    except IntegrityError:
        raise HttpError(409, "Duplicate request in progress. Retry in a moment.")
    return JsonResponse(body, status=status_code)


@router.get("/orders", response=list[OrderOut], auth=JWTAuth())
def my_orders(request, limit: int = 50):
    qs = (Order.objects.filter(buyer=request.auth).select_related("seller")
          .prefetch_related("items")[: max(1, min(limit, 100))])
    return [_order(o) for o in qs]


def _own_order(request, reference):
    try:
        return Order.objects.get(reference=reference, buyer=request.auth)
    except Order.DoesNotExist:
        raise HttpError(404, "Order not found.")


@router.post("/orders/{reference}/confirm", response=OrderOut, auth=JWTAuth())
def confirm_delivery(request, reference: str):
    """Buyer confirms receipt: escrow pays the seller."""
    try:
        order = services.release_to_seller(_own_order(request, reference))
    except services.MarketError as exc:
        raise HttpError(422, str(exc))
    return _order(order)


@router.post("/orders/{reference}/cancel", response=OrderOut, auth=JWTAuth())
def cancel_order(request, reference: str):
    """Buyer cancels before shipping: escrow refunds the wallet and stock is restored."""
    try:
        order = services.cancel_and_refund(_own_order(request, reference))
    except services.MarketError as exc:
        raise HttpError(422, str(exc))
    return _order(order)
