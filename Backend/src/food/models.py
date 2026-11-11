from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Restaurant(models.Model):
    class Category(models.TextChoices):
        BUKA = "buka", "Authentic Local Buka"
        FINE = "fine", "Fine Dining Restaurant"
        GRILL = "grill", "Grills & Suya Spot"
        BAKERY = "bakery", "Bakery & Pastries"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="restaurants")
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    category = models.CharField(max_length=12, choices=Category.choices, default=Category.BUKA)
    tags = models.JSONField(default=list, blank=True)  # cuisine chips on the page: "swallow", "pastry"...
    description = models.CharField(max_length=300, blank=True)
    image_url = models.URLField(max_length=500, blank=True)
    address = models.CharField(max_length=255)
    phone = models.CharField(max_length=30)
    hours = models.CharField(max_length=120, blank=True)
    delivery_fee = models.DecimalField(max_digits=8, decimal_places=2, default=500)
    eta_min = models.PositiveSmallIntegerField(default=15)
    eta_max = models.PositiveSmallIntegerField(default=30)
    is_open = models.BooleanField(default=True)    # vendor's "Accepting orders" switch
    is_active = models.BooleanField(default=True)  # approved by staff; hidden from customers when off
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class MenuItem(models.Model):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="items")
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=300, blank=True)
    category = models.CharField(max_length=60, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(1)])
    image_url = models.URLField(max_length=500, blank=True)
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.name} ({self.restaurant})"


class FoodOrder(models.Model):
    class Status(models.TextChoices):
        INCOMING = "incoming", "Incoming"
        PREPARING = "preparing", "Preparing"
        DISPATCH = "dispatch", "Awaiting dispatch"
        HANDED_OVER = "handed_over", "Handed over"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        DECLINED = "declined", "Declined by restaurant"

    reference = models.CharField(max_length=20, unique=True)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="food_orders")
    restaurant = models.ForeignKey(Restaurant, on_delete=models.PROTECT, related_name="orders")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    delivery_fee = models.DecimalField(max_digits=8, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.INCOMING, db_index=True)
    delivery_address = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class FoodOrderItem(models.Model):
    order = models.ForeignKey(FoodOrder, on_delete=models.CASCADE, related_name="items")
    menu_item = models.ForeignKey(MenuItem, null=True, on_delete=models.SET_NULL, related_name="+")
    name = models.CharField(max_length=120)  # snapshot: the menu can change after ordering
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    qty = models.PositiveSmallIntegerField()


class Reservation(models.Model):
    class Status(models.TextChoices):
        CONFIRMED = "confirmed", "Confirmed"
        CANCELLED = "cancelled", "Cancelled"

    reference = models.CharField(max_length=20, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="table_reservations")
    restaurant = models.ForeignKey(Restaurant, on_delete=models.PROTECT, related_name="reservations")
    date = models.DateField()
    time = models.TimeField()
    guests = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(20)])
    note = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.CONFIRMED)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date", "time"]
