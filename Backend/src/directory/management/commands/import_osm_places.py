"""Import restaurants / cafes / fast food for an area from OpenStreetMap into the directory.

  python manage.py import_osm_places --dry-run            # fetch + count, write nothing (do this first)
  python manage.py import_osm_places                      # Abuja city box, writes listings
  python manage.py import_osm_places --bbox 8.85,7.15,9.25,7.65 --city Abuja
  python manage.py import_osm_places --file overpass.json # offline: a saved Overpass response
  python manage.py import_osm_places --pbf nigeria.osm.pbf --dry-run # offline: local Geofabrik extract

Re-running is safe: existing rows are refreshed, claimed listings are left alone, nothing is duplicated.
"""
import json

from django.core.management.base import BaseCommand, CommandError

from directory import importers


def parse_bbox(text):
    try:
        s, w, n, e = (float(p) for p in text.split(","))
    except ValueError:
        raise CommandError("--bbox must be four numbers: south,west,north,east (e.g. 8.85,7.15,9.25,7.65)")
    if not (-90 <= s < n <= 90 and -180 <= w < e <= 180):
        raise CommandError("--bbox needs south < north and west < east, within valid latitude/longitude.")
    if (n - s) * (e - w) > 4:
        raise CommandError("--bbox is too large for one request (keep it to a city). Split it into smaller boxes.")
    return s, w, n, e


class Command(BaseCommand):
    help = "Import food places from OpenStreetMap (Overpass API or a local PBF extract) into the directory."

    def add_arguments(self, parser):
        parser.add_argument("--bbox", default=",".join(str(v) for v in importers.ABUJA_BBOX),
                            help="south,west,north,east (default: Abuja city box)")
        parser.add_argument("--city", default="Abuja", help="city name used when a place has no address")
        parser.add_argument("--overpass-url", default=importers.OVERPASS_URL)
        source = parser.add_mutually_exclusive_group()
        source.add_argument("--file", help="read a saved Overpass JSON response instead of calling the API")
        source.add_argument("--pbf", help="read a local OSM PBF extract instead of calling the API")
        parser.add_argument("--dry-run", action="store_true", help="count what would change; write nothing")

    def handle(self, *args, **opts):
        if opts["pbf"]:
            bbox = parse_bbox(opts["bbox"])
            self.stdout.write(f"Reading OSM PBF {opts['pbf']} for places in {bbox} ...")
            try:
                elements = importers.read_pbf(opts["pbf"], bbox)
            except importers.ImportErrorMessage as exc:
                raise CommandError(str(exc))
        elif opts["file"]:
            try:
                with open(opts["file"], encoding="utf-8") as fh:
                    data = json.load(fh)
            except (OSError, ValueError) as exc:
                raise CommandError(f"Could not read {opts['file']}: {exc}")
        else:
            bbox = parse_bbox(opts["bbox"])
            self.stdout.write(f"Asking Overpass for food places in {bbox} ...")
            try:
                data = importers.fetch_overpass(bbox, url=opts["overpass_url"])
            except importers.ImportErrorMessage as exc:
                raise CommandError(str(exc))
        if not opts["pbf"]:
            elements = data.get("elements") if isinstance(data, dict) else None
            if not isinstance(elements, list):
                raise CommandError("That response has no 'elements' list; it is not an Overpass result.")
        stats = importers.import_elements(elements, city=opts["city"], dry_run=opts["dry_run"])
        verb = "Would change" if opts["dry_run"] else "Done"
        self.stdout.write(self.style.SUCCESS(
            f"{verb}: {stats['created']} new, {stats['updated']} updated, {stats['unchanged']} unchanged, "
            f"{stats['claimed']} claimed (left alone), {stats['skipped']} skipped (no name / no position)."
        ))
        self.stdout.write("Credit shown with these listings: (c) OpenStreetMap contributors.")
