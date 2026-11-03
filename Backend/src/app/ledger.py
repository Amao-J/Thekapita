"""All money movement goes through this module. Nothing else may write to
Wallet.balance or LedgerEntry. Entries are append-only; Wallet.balance is a
cached running total that is only ever changed in the same DB transaction
that inserts the matching entries, under a row lock."""
import uuid
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import LedgerEntry, Wallet


class LedgerError(Exception):
    """A business-rule failure (insufficient funds, limit hit...). Safe to show users."""


def _spent(wallet, since):
    total = wallet.entries.filter(
        kind=LedgerEntry.Kind.TRANSFER_OUT, created_at__gte=since
    ).aggregate(s=Sum("amount"))["s"]
    return -(total or Decimal("0"))


@transaction.atomic
def transfer(sender, recipient, amount: Decimal):
    if sender.pk == recipient.pk:
        raise LedgerError("You can't send money to yourself.")
    # Lock both wallets in a fixed (pk) order so two opposite transfers can't deadlock.
    locked = {w.user_id: w for w in
              Wallet.objects.select_for_update().filter(user__in=[sender, recipient]).order_by("pk")}
    src, dst = locked[sender.pk], locked[recipient.pk]

    if src.balance < amount:
        raise LedgerError("Insufficient balance.")
    now = timezone.localtime()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = day_start.replace(day=1)
    if _spent(src, day_start) + amount > src.daily_limit:
        raise LedgerError("This would exceed your daily transfer limit.")
    if _spent(src, month_start) + amount > src.monthly_limit:
        raise LedgerError("This would exceed your monthly transfer limit.")

    ref = f"TX-{uuid.uuid4().hex[:10].upper()}"
    LedgerEntry.objects.create(wallet=src, amount=-amount, kind=LedgerEntry.Kind.TRANSFER_OUT,
                               counterparty=recipient, reference=ref)
    LedgerEntry.objects.create(wallet=dst, amount=amount, kind=LedgerEntry.Kind.TRANSFER_IN,
                               counterparty=sender, reference=ref)
    src.balance -= amount
    dst.balance += amount
    src.save(update_fields=["balance"])
    dst.save(update_fields=["balance"])
    return ref, src.balance


@transaction.atomic
def credit(user, amount: Decimal, reference: str, kind=LedgerEntry.Kind.FUNDING):
    """Idempotent by (wallet, reference, kind): the future payment webhook can
    call this any number of times for the same provider reference."""
    wallet = Wallet.objects.select_for_update().get(user=user)
    _, created = LedgerEntry.objects.get_or_create(
        wallet=wallet, reference=reference, kind=kind, defaults={"amount": amount}
    )
    if created:
        wallet.balance += amount
        wallet.save(update_fields=["balance"])
    return wallet.balance


# ---- Escrow (used by the marketplace) ---------------------------------------
# Money a buyer pays at checkout moves to a system "escrow" wallet, then on to the
# seller when the buyer confirms delivery, or back to the buyer if the order is
# cancelled. Every leg is a pair of LedgerEntry rows, so the books always balance.

ESCROW_USERNAME = "system-escrow"


def escrow_user():
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user, created = User.objects.get_or_create(
        username=ESCROW_USERNAME,
        defaults={"first_name": "theKapita Escrow", "email": "", "is_active": False},
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])
    Wallet.objects.get_or_create(user=user)
    return user


@transaction.atomic
def _move(src_user, dst_user, amount: Decimal, kind, reference: str):
    """Internal move with no daily/monthly limits (those apply to peer transfers only)."""
    locked = {w.user_id: w for w in
              Wallet.objects.select_for_update().filter(user__in=[src_user, dst_user]).order_by("pk")}
    src, dst = locked[src_user.pk], locked[dst_user.pk]
    if src.balance < amount:
        raise LedgerError("Insufficient balance.")
    LedgerEntry.objects.create(wallet=src, amount=-amount, kind=kind, counterparty=dst_user, reference=reference)
    LedgerEntry.objects.create(wallet=dst, amount=amount, kind=kind, counterparty=src_user, reference=reference)
    src.balance -= amount
    dst.balance += amount
    src.save(update_fields=["balance"])
    dst.save(update_fields=["balance"])
    return src.balance


def escrow_hold(buyer, amount: Decimal, reference: str):
    return _move(buyer, escrow_user(), amount, LedgerEntry.Kind.ESCROW_HOLD, reference)


def escrow_release(seller, amount: Decimal, reference: str):
    return _move(escrow_user(), seller, amount, LedgerEntry.Kind.ESCROW_RELEASE, reference)


def escrow_refund(buyer, amount: Decimal, reference: str):
    return _move(escrow_user(), buyer, amount, LedgerEntry.Kind.ESCROW_REFUND, reference)
