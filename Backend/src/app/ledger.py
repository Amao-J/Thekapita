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
