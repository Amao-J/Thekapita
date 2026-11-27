from django.conf import settings
from django.db import models


class Property(models.Model):
    """A property for sale, long-term rent or short-let, listed by an owner or agent."""

    class Intent(models.TextChoices):
        BUY = "buy", "For sale"
        RENT = "rent", "For rent"
        SHORTLET = "shortlet", "Short-let"

    class Category(models.TextChoices):
        HOUSE = "house", "House / Duplex"
        APARTMENT = "apartment", "Apartment / Flat"
        COMMERCIAL = "commercial", "Commercial space"
        LAND = "land", "Land / plot"

    class TitleDoc(models.TextChoices):
        COFO = "cofo", "Certificate of Occupancy"
        GOV = "gov", "Governor's Consent"
        DEED = "deed", "Deed of Assignment"
        SURVEY = "survey", "Registered Survey Only"
        RECEIPT = "receipt", "Family Receipt (High Risk)"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Live"
        REJECTED = "rejected", "Rejected"
        ARCHIVED = "archived", "Archived"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="haven_properties")
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, max_length=4000)
    category = models.CharField(max_length=12, choices=Category.choices, default=Category.APARTMENT, db_index=True)
    intent = models.CharField(max_length=10, choices=Intent.choices, db_index=True)
    # Naira. Sale: total price. Rent: per year. Short-let: per night (see price_period).
    price = models.DecimalField(max_digits=14, decimal_places=2)
    negotiable = models.BooleanField(default=False)
    address = models.CharField(max_length=255)
    city = models.CharField(max_length=120, db_index=True, help_text="Area and city, e.g. Lekki Phase 1, Lagos.")
    bedrooms = models.PositiveSmallIntegerField(default=0)
    bathrooms = models.PositiveSmallIntegerField(default=0)
    parking = models.PositiveSmallIntegerField(default=0)
    area_sqm = models.PositiveIntegerField(null=True, blank=True)
    image_url = models.URLField(max_length=500, blank=True)
    image_file = models.ImageField(upload_to="haven/properties/images/", blank=True)
    video_file = models.FileField(upload_to="haven/properties/videos/", blank=True)
    title_doc = models.CharField(max_length=10, choices=TitleDoc.choices, default=TitleDoc.COFO)
    title_verified = models.BooleanField(default=False, help_text="Staff only: tick once the title document is audited.")
    agent_verified = models.BooleanField(default=False, help_text="Staff only: shows the Verified Agent badge.")
    featured = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    views = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-featured", "-created_at", "-id"]
        verbose_name_plural = "Properties"
        indexes = [models.Index(fields=["status", "intent", "price"])]

    def __str__(self):
        return f"{self.title} ({self.get_intent_display()})"

    @property
    def price_period(self):
        return {self.Intent.RENT: "year", self.Intent.SHORTLET: "night"}.get(self.intent, "")


class PropertyBookmark(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="haven_bookmarks")
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="bookmarks")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "property"], name="haven_uniq_bookmark")]
