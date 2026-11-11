"""python manage.py seed_food  -- demo restaurants + menus (idempotent). Safe to re-run."""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from app.models import Wallet
from food.models import MenuItem, Restaurant

IMG = "https://images.unsplash.com/"
DATA = [
    ("Iya Basira Local Buka", "buka", ["buka", "swallow"], "15 Admiralty Way, Lekki Phase 1", 500, 15, 25, [
        ("Amala & Gbegiri", 2500, "Swallow"), ("Pounded Yam & Egusi", 3000, "Swallow"), ("Abula Combo (Buka Special)", 3800, "Swallow")]),
    ("The Kapita Grand Bistro", "fine", ["fine"], "Adeola Odeku Street, Victoria Island", 1500, 30, 45, [
        ("Smoked Jollof & Grill", 6500, "Mains")]),
    ("Mama Tobi Bukateria", "buka", ["buka", "swallow"], "22 Herbert Macaulay Way, Yaba", 500, 20, 30, [
        ("Ofada Rice & Ayamase", 3200, "Rice"), ("Eba & Okra Soup", 2800, "Swallow")]),
    ("Alhaji's Northern Suya", "grill", ["suya"], "Bode Thomas Street, Surulere", 700, 15, 25, [
        ("Beef Suya (Large)", 3500, "Grills"), ("Chicken Suya Wrap", 2800, "Grills")]),
    ("Oleku Fine Dining & Lounge", "fine", ["fine"], "Bourdillon Road, Ikoyi", 1500, 35, 50, [
        ("Peppered Snail Starter", 5200, "Starters"), ("Grilled Catfish Platter", 9500, "Mains")]),
    ("Crust & Cream Bakery", "bakery", ["pastry"], "Akin Adesola Street, Victoria Island", 800, 15, 30, [
        ("Meat Pie (3 pack)", 2400, "Pastries"), ("Chapman Pitcher", 3000, "Drinks")]),
]


class Command(BaseCommand):
    help = "Create demo restaurants and menus."

    def handle(self, *args, **opts):
        User = get_user_model()
        owner, created = User.objects.get_or_create(
            username="demo-vendor@kapita.local",
            defaults={"email": "demo-vendor@kapita.local", "first_name": "Demo Vendor", "is_active": False},
        )
        if created:
            owner.set_unusable_password()
            owner.save(update_fields=["password"])
        Wallet.objects.get_or_create(user=owner)
        made = 0
        for name, cat, tags, addr, fee, lo, hi, menu in DATA:
            r, new = Restaurant.objects.get_or_create(
                slug=name.lower().replace("'", "").replace("&", "and").replace(" ", "-"),
                defaults=dict(owner=owner, name=name, category=cat, tags=tags, address=addr, phone="08000000000",
                              delivery_fee=fee, eta_min=lo, eta_max=hi, is_open=True, is_active=True),
            )
            made += new
            for item, price, group in menu:
                MenuItem.objects.get_or_create(restaurant=r, name=item, defaults={"price": price, "category": group})
        self.stdout.write(self.style.SUCCESS(f"{made} new restaurant(s); {Restaurant.objects.count()} total."))
