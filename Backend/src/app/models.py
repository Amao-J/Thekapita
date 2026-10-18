from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    bio = models.CharField(max_length=200, blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    kyc_tier = models.PositiveSmallIntegerField(default=1)
    kapita_id = models.CharField(max_length=20, unique=True)
    handle = models.CharField(max_length=20, unique=True, null=True, blank=True)  # stored lowercase, no '@'


class Wallet(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    daily_limit = models.DecimalField(max_digits=14, decimal_places=2, default=500000)
    monthly_limit = models.DecimalField(max_digits=14, decimal_places=2, default=5000000)


class UsedRefreshToken(models.Model):
    """One row per refresh token that has been redeemed or revoked (by its jti).

    A refresh token is single-use: /auth/refresh records its jti here and issues a
    new pair. Presenting a recorded jti again is rejected, so a stolen refresh
    token stops working the moment the real client rotates it. Rows older than the
    token lifetime (30 days) are safe to purge.
    """
    jti = models.CharField(max_length=32, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    used_at = models.DateTimeField(auto_now_add=True)


class LedgerEntry(models.Model):
    """Append-only. credit = positive amount, debit = negative. Never edit or delete."""
    class Kind(models.TextChoices):
        TRANSFER_OUT = "transfer_out"
        TRANSFER_IN = "transfer_in"
        FUNDING = "funding"

    wallet = models.ForeignKey(Wallet, on_delete=models.PROTECT, related_name="entries")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    counterparty = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reference = models.CharField(max_length=40)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["wallet", "reference", "kind"], name="uniq_entry_per_ref")
        ]
        ordering = ["-created_at", "-id"]

    def save(self, *args, **kwargs):
        if self.pk:
            raise RuntimeError("Ledger entries are append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Ledger entries are append-only.")
