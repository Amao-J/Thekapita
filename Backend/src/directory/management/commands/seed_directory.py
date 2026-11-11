"""python manage.py seed_directory  -- demo listings (idempotent). Safe to re-run."""
from django.core.management.base import BaseCommand

from directory.models import Listing

DATA = [
    ("St. Nicholas Hospital", "hospitals", "57 Campbell Street, Lagos Island", "+234 1 280 0600", "Open 24 Hours • 7 Days a week",
     ["Emergency", "Maternity", "Laboratory"], 6.4531, 3.3958, True, "sponsored"),
    ("Lagos State Ministry of Health", "government", "Alausa Secretariat, Ikeja", "+234 1 700 0000", "Mon–Fri 8am–4pm",
     ["Licensing", "Public health"], 6.6147, 3.3590, True, "standard"),
    ("Kapita Model College", "schools", "12 Admiralty Way, Lekki Phase 1", "+234 802 000 0001", "Mon–Fri 7:30am–4pm",
     ["Primary", "Secondary"], 6.4474, 3.4723, False, "standard"),
    ("Yaba Tech Hub Co-working", "businesses", "34 Herbert Macaulay Way, Yaba", "+234 803 000 0002", "Mon–Sat 8am–8pm",
     ["Co-working", "Meeting rooms"], 6.5095, 3.3711, True, "standard"),
]


class Command(BaseCommand):
    help = "Create demo directory listings."

    def handle(self, *args, **opts):
        made = 0
        for name, cat, addr, phone, hours, services, lat, lng, verified, tier in DATA:
            _, new = Listing.objects.get_or_create(
                name=name,
                defaults=dict(category=cat, address=addr, phone=phone, hours=hours, services=services,
                              latitude=lat, longitude=lng, is_verified=verified, tier=tier,
                              status=Listing.Status.APPROVED),
            )
            made += new
        self.stdout.write(self.style.SUCCESS(f"{made} new listing(s); {Listing.objects.count()} total."))
