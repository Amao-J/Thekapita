"""List directory places that still have no photo, as a spreadsheet for whoever collects the photos.

  python manage.py export_photo_worklist --city Abuja --limit 200 --out worklist.csv

Each row has the listing id, name, address, phone and a link that opens that spot in a maps app (just to find the place).
Photos are then saved as <id>.jpg in a folder and loaded with `import_listing_photos`."""
import csv

from django.core.management.base import BaseCommand

from directory.models import Listing


class Command(BaseCommand):
    help = "Export approved listings that have no photo yet, as CSV."

    def add_arguments(self, parser):
        parser.add_argument("--category", default="restaurants", help="listing category, or 'all' (default: restaurants)")
        parser.add_argument("--city", default="", help="only this city")
        parser.add_argument("--limit", type=int, default=0, help="at most this many rows (0 = no limit)")
        parser.add_argument("--include-with-photo", action="store_true", help="also list places that already have a photo")
        parser.add_argument("--out", default="", help="write to this file instead of the screen")

    def handle(self, *args, **opts):
        qs = Listing.objects.filter(status=Listing.Status.APPROVED)
        if opts["category"] != "all":
            qs = qs.filter(category=opts["category"])
        if opts["city"]:
            qs = qs.filter(city__iexact=opts["city"])
        if not opts["include_with_photo"]:
            qs = qs.filter(image_key="")
        qs = qs.order_by("city", "name", "id")
        if opts["limit"] > 0:
            qs = qs[: opts["limit"]]

        handle = open(opts["out"], "w", newline="", encoding="utf-8") if opts["out"] else self.stdout
        try:
            writer = csv.writer(handle)
            writer.writerow(["id", "name", "category", "address", "city", "phone", "latitude", "longitude", "maps_link", "has_photo"])
            count = 0
            for l in qs.iterator():
                has_position = l.latitude is not None and l.longitude is not None
                link = f"https://www.google.com/maps/search/?api=1&query={l.latitude},{l.longitude}" if has_position else ""
                writer.writerow([l.id, l.name, l.category, l.address, l.city, l.phone, l.latitude or "", l.longitude or "",
                                 link, "yes" if l.image_key else "no"])
                count += 1
        finally:
            if opts["out"]:
                handle.close()
        if opts["out"]:
            self.stdout.write(self.style.SUCCESS(f"Wrote {count} place(s) to {opts['out']}."))
