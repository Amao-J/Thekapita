"""Food order lifecycle. Money moves only through app.ledger (escrow), same as the marketplace."""
import uuid
from collections import defaultdict
from decimal import Decimal

from django.db import transaction

from app import ledger
from app.models import Wallet

from .models import FoodOrder, FoodOrderItem, MenuItem, Restaurant


class FoodError(Exception):
    """A rule failure that is safe to show to the customer / vendor."""


@transaction.atomic
def place_order(user, restaurant_slug, items, address="", phone="", note=""):
    """items: [(menu_item_id, qty)]. Pays the total (items + delivery fee) from the customer's
    wallet into escrow. All-or-nothing."""
    try:
        restaurant = Restaurant.objects.select_related("owner").get(slug=restaurant_slug, is_active=True)
    except Restaurant.DoesNotExist:
        raise FoodError("This restaurant is no longer available.")
    if not restaurant.is_open:
        raise FoodError(f"{restaurant.name} isn't accepting orders right now.")
    if restaurant.owner_id == user.id:
        raise FoodError("You can't order from your own restaurant.")

    wanted = defaultdict(int)
    for item_id, qty in items:
        wanted[item_id] += qty
    menu = {
        m.id: m for m in MenuItem.objects.filter(restaurant=restaurant, id__in=wanted, is_available=True)
    }
    lines = []
    for item_id, qty in wanted.items():
        m = menu.get(item_id)
        if m is None:
            raise FoodError("An item in your order is no longer on the menu.")
        lines.append((m, qty))

    subtotal = sum((m.price * qty for m, qty in lines), Decimal("0"))
    total = subtotal + restaurant.delivery_fee
    order = FoodOrder.objects.create(
        reference=f"FOOD-{uuid.uuid4().hex[:10].upper()}",
        customer=user, restaurant=restaurant, subtotal=subtotal,
        delivery_fee=restaurant.delivery_fee, total=total,
        delivery_address=address, phone=phone, note=note,
    )
    FoodOrderItem.objects.bulk_create([
        FoodOrderItem(order=order, menu_item=m, name=m.name, unit_price=m.price, qty=qty) for m, qty in lines
    ])
    Wallet.objects.get_or_create(user=user)
    try:
        ledger.escrow_hold(user, total, order.reference)
    except ledger.LedgerError as exc:
        raise FoodError(str(exc))
    return order


def _locked(order_id):
    return FoodOrder.objects.select_for_update().select_related("restaurant__owner", "customer").get(pk=order_id)


# vendor-driven steps: current status -> allowed next statuses
VENDOR_FLOW = {
    FoodOrder.Status.INCOMING: {FoodOrder.Status.PREPARING, FoodOrder.Status.DECLINED},
    FoodOrder.Status.PREPARING: {FoodOrder.Status.DISPATCH},
    FoodOrder.Status.DISPATCH: {FoodOrder.Status.HANDED_OVER},
}


@transaction.atomic
def vendor_set_status(order_id, new_status):
    order = _locked(order_id)
    if new_status not in VENDOR_FLOW.get(order.status, set()):
        raise FoodError(f"An order that is '{order.get_status_display().lower()}' can't move to '{new_status}'.")
    if new_status == FoodOrder.Status.DECLINED:
        ledger.escrow_refund(order.customer, order.total, order.reference)
    order.status = new_status
    order.save(update_fields=["status", "updated_at"])
    return order


@transaction.atomic
def customer_cancel(order_id):
    order = _locked(order_id)
    if order.status != FoodOrder.Status.INCOMING:
        raise FoodError("The restaurant has already started this order, so it can't be cancelled.")
    ledger.escrow_refund(order.customer, order.total, order.reference)
    order.status = FoodOrder.Status.CANCELLED
    order.save(update_fields=["status", "updated_at"])
    return order


@transaction.atomic
def customer_confirm(order_id):
    """Customer received the food: escrow pays the restaurant owner's wallet."""
    order = _locked(order_id)
    if order.status not in (FoodOrder.Status.DISPATCH, FoodOrder.Status.HANDED_OVER):
        raise FoodError("You can confirm delivery once the restaurant has the order ready.")
    Wallet.objects.get_or_create(user=order.restaurant.owner)
    ledger.escrow_release(order.restaurant.owner, order.total, order.reference)
    order.status = FoodOrder.Status.COMPLETED
    order.save(update_fields=["status", "updated_at"])
    return order
