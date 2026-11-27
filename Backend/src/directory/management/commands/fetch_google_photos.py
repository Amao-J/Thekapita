"""Find Google Places photos for directory places that have none.

  python manage.py fetch_google_photos --city Abuja --limit 50 --dry-run   # look up, change nothing
  python manage.py fetch_google_photos --city Abuja --limit 50
  python manage.py fetch_google_photos --recheck                           # ask again about places Google had no photo for

Needs GOOGLE_PLACES_API_KEY (Places API (New) enabled). Uses Google's official API: scraping Google pages is not allowed.
Only the place id and a photo reference are saved: Google's terms do not allow keeping the picture itself, so the web app
loads it from Google when shown and labels it "Photo © Google". Each place costs one Google search, so use --limit and set
a budget alert in Google Cloud. A place is only matched when its name AND position agree with ours; otherwise it is left alone."""
import time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from directory import google_places
from directory.models import Listing


class Command(BaseCommand):
    help = "Attach Google Places photo references to listings that have no photo."

    def add_arguments(self, parser):
        parser.add_argument("--category", default="restaurants", help="listing category, or 'all' (default: restaurants)")
        parser.add_argument("--city", default="", help="only this city")
        parser.add_argument("--limit", type=int, default=50, help="look up at most this many places (default 50, 0 = all)")
        parser.add_argument("--recheck", action="store_true", help="also ask again about places already checked")
        parser.add_argument("--pause", type=float, default=0.2, help="seconds to wait between Google calls")
        parser.add_argument("--verbose", action="store_true", help="print what Google answered for every place")
        parser.add_argument("--dry-run", action="store_true", help="look up and report, save nothing")

    def handle(self, *args, **opts):
        key = settings.GOOGLE_PLACES_API_KEY
        if not key:
            raise CommandError("Set GOOGLE_PLACES_API_KEY first.")
        qs = Listing.objects.filter(status=Listing.Status.APPROVED, image_key="", google_photo_name="")
        if opts["category"] != "all":
            qs = qs.filter(category=opts["category"])
        if opts["city"]:
            qs = qs.filter(city__iexact=opts["city"])
        if not opts["recheck"]:
            qs = qs.filter(google_checked_at__isnull=True)
        qs = qs.order_by("id")
        if opts["limit"] > 0:
            qs = qs[: opts["limit"]]

        stats = {"photo": 0, "no_photo": 0, "no_match": 0, "error": 0}
        for listing in qs:
            try:
                found = google_places.find_place(key, listing.name, listing.address, listing.latitude, listing.longitude)
            except google_places.GooglePlacesError as exc:
                stats["error"] += 1
                self.stderr.write(f"  {listing.id} {listing.name}: {exc}")
                if exc.status in (400, 401, 403, 429):  # key problem or quota: every other call would fail too
                    raise CommandError(f"Stopping: {exc}. Check the key, that Places API (New) is enabled, and your quota.")
                continue
            if opts["verbose"]:
                self.stdout.write(f"  {listing.id} {listing.name!r} -> " + (
                    f"{found['matched_name']!r}, {found['photo_count']} photo(s)" if found else "no confident match"))
            if found is None:
                stats["no_match"] += 1
            else:
                stats["photo" if found["photo_name"] else "no_photo"] += 1
            if not opts["dry_run"]:
                listing.google_checked_at = timezone.now()
                fields = ["google_checked_at"]
                if found:
                    listing.google_place_id = found["place_id"]
                    listing.google_photo_name = found["photo_name"]
                    listing.google_photo_author = found["author"]
                    fields += ["google_place_id", "google_photo_name", "google_photo_author"]
                listing.save(update_fields=fields)  # auto_now updated_at is not touched: not a content edit
            time.sleep(opts["pause"])

        verb = "Would attach" if opts["dry_run"] else "Attached"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {stats['photo']} Google photo(s); {stats['no_photo']} matched a place with no photos; "
            f"{stats['no_match']} had no confident match; {stats['error']} errors."
        ))
