from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    bio = models.CharField(max_length=200, blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    kyc_tier = models.PositiveSmallIntegerField(default=1)
    kapita_id = models.CharField(max_length=20, unique=True)
    handle = models.CharField(max_length=20, unique=True, null=True, blank=True)  # stored lowercase, no '@'
    date_of_birth = models.DateField(null=True, blank=True)
    location = models.CharField(max_length=100, blank=True)   # "Lagos, Nigeria"
    address = models.CharField(max_length=200, blank=True)    # residential address
    language = models.CharField(max_length=30, default="English")


class Wallet(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    daily_limit = models.DecimalField(max_digits=14, decimal_places=2, default=500000)
    monthly_limit = models.DecimalField(max_digits=14, decimal_places=2, default=5000000)


class WalletFundingRequest(models.Model):
    class Channel(models.TextChoices):
        BANK_TRANSFER = "bank_transfer"
        CARD = "card"
        USSD = "ussd"

    class Status(models.TextChoices):
        PENDING = "pending"
        CONFIRMED = "confirmed"
        FAILED = "failed"

    wallet = models.ForeignKey(Wallet, on_delete=models.PROTECT, related_name="funding_requests")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    channel = models.CharField(max_length=20, choices=Channel.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reference = models.CharField(max_length=40, unique=True)
    idempotency_key = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["wallet", "idempotency_key"], name="uniq_wallet_funding_idem")
        ]


class WalletBeneficiary(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_beneficiaries"
    )
    beneficiary = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_by_wallet_users"
    )
    name = models.CharField(max_length=80)
    handle = models.CharField(max_length=254)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "beneficiary"], name="uniq_wallet_beneficiary")
        ]


class UsedRefreshToken(models.Model):
    """Used refresh tokens are stored to prevent reuse (replay attacks)."""
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


class ServicePreference(models.Model):
    """Per-user preferences for the ecosystem services (profile page > Service Profiles)."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="service_prefs")
    # Eats
    dietary_preference = models.CharField(max_length=120, blank=True)
    favorite_cuisine = models.CharField(max_length=120, blank=True)
    default_address = models.CharField(max_length=200, blank=True)
    # Ride
    preferred_ride = models.CharField(max_length=60, blank=True)
    quiet_mode = models.BooleanField(default=False)
    default_payment = models.CharField(max_length=60, default="theKapita Pay Wallet")
    # Talent
    primary_skill = models.CharField(max_length=100, blank=True)
    experience_level = models.CharField(max_length=60, blank=True)
    # Health (sensitive: only ever returned to the owner)
    blood_group = models.CharField(max_length=3, blank=True)
    emergency_contact = models.CharField(max_length=30, blank=True)
    health_insurance_id = models.CharField(max_length=40, blank=True)


class UserSettings(models.Model):
    """Privacy + notification toggles (profile page > Security & Settings / Notifications)."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="app_settings")
    # Privacy
    public_visibility = models.BooleanField(default=True)   # others can find me by @handle
    location_services = models.BooleanField(default=True)
    personalization = models.BooleanField(default=True)
    marketing = models.BooleanField(default=False)
    # Notifications
    push = models.BooleanField(default=True)
    messages = models.BooleanField(default=True)
    updates = models.BooleanField(default=True)
    offers = models.BooleanField(default=False)
