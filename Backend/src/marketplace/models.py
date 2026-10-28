#thekapita model
import uuid

from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils.text import slugify

from .media import signed_url


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


def _unique_slug(model, text, instance_pk=None, max_length=300):
    base = slugify(text)[: max_length - 8] or "item"
    slug, n = base, 1
    while model.objects.filter(slug=slug).exclude(pk=instance_pk).exists():
        n += 1
        slug = f"{base}-{n}"
    return slug


class Seller(TimeStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="seller")
    store_name = models.CharField(max_length=120)
    is_verified = models.BooleanField(default=False, help_text="Shows the verified badge on listings.")
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.store_name


class Category(TimeStampedModel):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, blank=True, help_text="Must match the key used by the page filters, e.g. electronics.")
    description = models.TextField(blank=True)
    image_key = models.FileField(
        upload_to="marketplace/categories/", blank=True, null=True,
        validators=[FileExtensionValidator(["svg", "png", "jpg", "jpeg", "webp"])],
    )

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    @property
    def image_url(self):
        return signed_url(self.image_key)


class Product(TimeStampedModel):
    BADGE_CHOICES = [("", "None"), ("new", "New"), ("bestseller", "Bestseller"), ("limited", "Limited"), ("sale", "Sale")]

    seller = models.ForeignKey(Seller, on_delete=models.PROTECT, related_name="products")
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, blank=True, max_length=300)
    sku = models.CharField(max_length=100, unique=True, blank=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    short_description = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, help_text="Price in ₦.")
    compare_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Pre-discount price (strikethrough).")
    stock = models.PositiveIntegerField(default=0, help_text="Decremented at checkout, restored on cancellation.")
    image_key = models.ImageField(upload_to="marketplace/products/%Y/%m/", blank=True, null=True)
    tags = models.CharField(max_length=500, blank=True, help_text="Comma-separated.")
    in_stock = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True, help_text="Unpublish without deleting.")
    featured = models.BooleanField(default=False)
    badge = models.CharField(max_length=20, choices=BADGE_CHOICES, blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0, help_text="Lower = shown first.")

    class Meta:
        ordering = ["sort_order", "name"]
        indexes = [models.Index(fields=["category", "in_stock"]), models.Index(fields=["featured"])]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _unique_slug(Product, self.name, self.pk)
        if not self.sku:
            self.sku = f"MKT-{uuid.uuid4().hex[:8].upper()}"
        self.in_stock = self.stock > 0
        super().save(*args, **kwargs)

    @property
    def image_url(self):
        return signed_url(self.image_key)


class ProductImage(TimeStampedModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="gallery_images")
    image_key = models.ImageField(upload_to="marketplace/products/gallery/%Y/%m/")
    alt_text = models.CharField(max_length=255, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    @property
    def url(self):
        return signed_url(self.image_key)


class Order(TimeStampedModel):
    IN_ESCROW, SHIPPED, COMPLETED, CANCELLED = "in_escrow", "shipped", "completed", "cancelled"
    STATUS_CHOICES = [
        (IN_ESCROW, "Paid - held in escrow"),
        (SHIPPED, "Shipped"),
        (COMPLETED, "Completed - seller paid"),
        (CANCELLED, "Cancelled - refunded"),
    ]

    reference = models.CharField(max_length=40, unique=True)
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="marketplace_orders")
    seller = models.ForeignKey(Seller, on_delete=models.PROTECT, related_name="orders")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=IN_ESCROW, db_index=True)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    full_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference} · {self.get_status_display()}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="order_items")
    name = models.CharField(max_length=255, help_text="Product name at time of purchase.")
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    qty = models.PositiveIntegerField()

    @property
    def line_total(self):
        return self.unit_price * self.qty

    def __str__(self):
        return f"{self.name} × {self.qty}"
