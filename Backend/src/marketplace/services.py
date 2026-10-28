"""Order lifecycle. API and admin both go through here so the rules live in one place."""
import uuid
from collections import defaultdict
from decimal import Decimal

from django.db import transaction

from app import ledger

from .models import Order, OrderItem, Product


class MarketError(Exception):
    """A rule failure that is safe to show to the buyer."""


@transaction.atomic
def place_orders(user, items, delivery):
    """items: [(product_id, qty)]. One Order per seller; each is paid from the buyer's
    wallet into escrow. All-or-nothing: any failure rolls back every order and hold."""
    wanted = defaultdict(int)
    for pid, qty in items:
        wanted[pid] += qty

    products = {
        p.id: p
        for p in Product.objects.select_for_update(of=("self",))
        .select_related("seller")
        .filter(id__in=wanted, is_active=True, seller__is_active=True)
        .order_by("id")
    }
    by_seller = defaultdict(list)
    for pid, qty in wanted.items():
        p = products.get(pid)
        if p is None:
            raise MarketError("An item in your cart is no longer available.")
        if p.seller.user_id == user.id:
            raise MarketError("You can't buy your own product.")
        if p.stock < qty:
            raise MarketError(f"{p.name} is out of stock." if p.stock <= 0 else f"Only {p.stock} of {p.name} left.")
        by_seller[p.seller_id].append((p, qty))

    orders = []
    for lines in by_seller.values():
        total = sum((p.price * qty for p, qty in lines), Decimal("0"))
        order = Order.objects.create(
            reference=f"ORD-{uuid.uuid4().hex[:10].upper()}",
            buyer=user, seller=lines[0][0].seller, total=total, **delivery,
        )
        for p, qty in lines:
            OrderItem.objects.create(order=order, product=p, name=p.name, unit_price=p.price, qty=qty)
            p.stock -= qty
            p.save()  # Product.save() flips in_stock off at zero
        try:
            ledger.escrow_hold(user, total, order.reference)
        except ledger.LedgerError as exc:
            raise MarketError(str(exc))
        orders.append(order)
    return orders


@transaction.atomic
def _locked(order):
    return Order.objects.select_for_update().select_related("seller__user").get(pk=order.pk)


@transaction.atomic
def mark_shipped(order):
    order = _locked(order)
    if order.status != Order.IN_ESCROW:
        raise MarketError("Only orders held in escrow can be marked shipped.")
    order.status = Order.SHIPPED
    order.save(update_fields=["status", "updated_at"])
    return order


@transaction.atomic
def release_to_seller(order):
    """Buyer confirmed delivery (or an admin forced it): pay the seller out of escrow."""
    order = _locked(order)
    if order.status not in (Order.IN_ESCROW, Order.SHIPPED):
        raise MarketError("This order is already settled.")
    try:
        ledger.escrow_release(order.seller.user, order.total, order.reference)
    except ledger.LedgerError as exc:
        raise MarketError(str(exc))
    order.status = Order.COMPLETED
    order.save(update_fields=["status", "updated_at"])
    return order


@transaction.atomic
def cancel_and_refund(order, *, allow_shipped=False):
    order = _locked(order)
    allowed = (Order.IN_ESCROW, Order.SHIPPED) if allow_shipped else (Order.IN_ESCROW,)
    if order.status not in allowed:
        raise MarketError("This order can no longer be cancelled.")
    try:
        ledger.escrow_refund(order.buyer, order.total, order.reference)
    except ledger.LedgerError as exc:
        raise MarketError(str(exc))
    for item in order.items.select_related("product"):
        product = Product.objects.select_for_update().get(pk=item.product_id)
        product.stock += item.qty
        product.in_stock = True
        product.save()
    order.status = Order.CANCELLED
    order.save(update_fields=["status", "updated_at"])
    return order
