from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Listing(models.Model):
    class Category(models.TextChoices):
        BUSINESSES = "businesses", "Local Business"
        HOSPITALS = "hospitals", "Hospital & Health"
        SCHOOLS = "schools", "School & Education"
        GOVERNMENT = "government", "Government Agency"

    class Tier(models.TextChoices):
        STANDARD = "standard", "Standard"
        SPONSORED = "sponsored", "Sponsored"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    name = models.CharField(max_length=150)
    category = models.CharField(max_length=12, choices=Category.choices, db_index=True)
    description = models.CharField(max_length=400, blank=True)
    address = models.CharField(max_length=255)
    city = models.CharField(max_length=80, blank=True)
    phone = models.CharField(max_length=30)
    hours = models.CharField(max_length=120, blank=True)
    services = models.JSONField(default=list, blank=True)
    tier = models.CharField(max_length=10, choices=Tier.choices, default=Tier.STANDARD)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="directory_listings"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Review(models.Model):
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="directory_reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [models.UniqueConstraint(fields=["listing", "user"], name="uniq_review_per_user")]


class Bookmark(models.Model):
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="bookmarks")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="directory_bookmarks")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["listing", "user"], name="uniq_bookmark_per_user")]


class Report(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"

    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="reports")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="directory_reports"
    )
    issue_type = models.CharField(max_length=80)
    notes = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
