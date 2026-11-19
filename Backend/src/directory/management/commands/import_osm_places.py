"""Import OpenStreetMap places from Overpass or a local PBF extract into the directory.

  python manage.py import_osm_places --dry-run            # fetch + count, write nothing (do this first)
  python manage.py import_osm_places                      # Abuja city box, writes listings
  python manage.py import_osm_places --bbox 8.85,7.15,9.25,7.65 --city Abuja
  python manage.py import_osm_places --file overpass.json # offline: a saved Overpass response
  python manage.py import_osm_places --pbf nigeria.osm.pbf --dry-run # offline: local Geofabrik extract
  python manage.py import_osm_places --pbf nigeria.osm.pbf --cities Abuja,Lagos --categories all --dry-run
  python manage.py import_osm_places --pbf nigeria.osm.pbf --cities Abuja,Lagos --categories all --export-json directory\\exports\\abuja-lagos.json --dry-run

Re-running is safe: existing rows are refreshed, claimed listings are left alone, nothing is duplicated.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from directory import importers


def parse_categories(text):
    values = {part.strip().lower() for part in text.split(",") if part.strip()}
    if "all" in values:
        if len(values) != 1:
            raise CommandError("--categories all cannot be combined with individual categories.")
        return importers.ALL_CATEGORIES
    valid = set(importers.ALL_CATEGORIES)
    invalid = values - valid
    if invalid:
        raise CommandError(f"Unknown categories: {', '.join(sorted(invalid))}. Choose from: {', '.join(sorted(valid))}.")
    if not values:
        raise CommandError("--categories must include at least one category.")
    return tuple(sorted(values))


def parse_cities(text):
    names = [part.strip() for part in text.split(",") if part.strip()]
    if not names:
        raise CommandError("--cities must include at least one city.")
    unknown = [name for name in names if name.casefold() not in {city.casefold() for city in importers.CITY_BBOXES}]
    if unknown:
        raise CommandError(
            f"Unknown cities: {', '.join(unknown)}. Choose from: {', '.join(importers.CITY_BBOXES)}."
        )
    boxes = {}
    for name in names:
        city = next(city for city in importers.CITY_BBOXES if city.casefold() == name.casefold())
        boxes[city] = importers.CITY_BBOXES[city]
    return boxes


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
    help = "Import OpenStreetMap directory places (Overpass API or a local PBF extract)."

    def add_arguments(self, parser):
        parser.add_argument("--bbox",
                            help="south,west,north,east (default: Abuja city box)")
        parser.add_argument("--cities", help="comma-separated named city boxes for PBF imports (Abuja,Lagos)")
        parser.add_argument("--categories", default="restaurants",
                            help="comma-separated categories or 'all': restaurants,businesses,hospitals,schools,government")
        parser.add_argument("--export-json", help="write the selected PBF elements to a reusable JSON snapshot")
        parser.add_argument("--city", default="Abuja", help="city name used when a place has no address")
        parser.add_argument("--overpass-url", default=importers.OVERPASS_URL)
        source = parser.add_mutually_exclusive_group()
        source.add_argument("--file", help="read a saved Overpass JSON response instead of calling the API")
        source.add_argument("--pbf", help="read a local OSM PBF extract instead of calling the API")
        parser.add_argument("--dry-run", action="store_true", help="count what would change; write nothing")

    def handle(self, *args, **opts):
        categories = parse_categories(opts["categories"])
        if opts["export_json"] and not opts["pbf"]:
            raise CommandError("--export-json is only supported with --pbf.")
        if opts["pbf"]:
            if opts["cities"]:
                if opts["bbox"]:
                    raise CommandError("--cities cannot be combined with --bbox.")
                boxes = parse_cities(opts["cities"])
            else:
                boxes = parse_bbox(opts["bbox"] or ",".join(str(v) for v in importers.ABUJA_BBOX))
            self.stdout.write(f"Reading OSM PBF {opts['pbf']} for {', '.join(categories)} in {boxes} ...")
            try:
                elements = importers.read_pbf(opts["pbf"], boxes, categories)
            except importers.ImportErrorMessage as exc:
                raise CommandError(str(exc))
            if opts["export_json"]:
                snapshot = {
                    "source": "OpenStreetMap",
                    "attribution": "(c) OpenStreetMap contributors",
                    "cities": list(boxes) if isinstance(boxes, dict) else [opts["city"]],
                    "categories": list(categories),
                    "elements": elements,
                }
                try:
                    export_path = Path(opts["export_json"])
                    export_path.parent.mkdir(parents=True, exist_ok=True)
                    with export_path.open("w", encoding="utf-8") as fh:
                        json.dump(snapshot, fh, ensure_ascii=False, separators=(",", ":"))
                except OSError as exc:
                    raise CommandError(f"Could not write JSON snapshot {opts['export_json']}: {exc}") from exc
                self.stdout.write(f"Saved PBF data snapshot to {opts['export_json']}.")
        elif opts["file"]:
            if opts["cities"]:
                raise CommandError("--cities is only supported with --pbf.")
            try:
                with open(opts["file"], encoding="utf-8") as fh:
                    data = json.load(fh)
            except (OSError, ValueError) as exc:
                raise CommandError(f"Could not read {opts['file']}: {exc}")
        else:
            if opts["cities"]:
                raise CommandError("--cities is only supported with --pbf.")
            if set(categories) != {"restaurants"}:
                raise CommandError("Overpass mode currently supports restaurants only; use --pbf for other categories.")
            bbox = parse_bbox(opts["bbox"] or ",".join(str(v) for v in importers.ABUJA_BBOX))
            self.stdout.write(f"Asking Overpass for food places in {bbox} ...")
            try:
                data = importers.fetch_overpass(bbox, url=opts["overpass_url"])
            except importers.ImportErrorMessage as exc:
                raise CommandError(str(exc))
        if not opts["pbf"]:
            elements = data.get("elements") if isinstance(data, dict) else None
            if not isinstance(elements, list):
                raise CommandError("That response has no 'elements' list; it is not an Overpass result.")
        stats = importers.import_elements(
            elements, city=opts["city"], dry_run=opts["dry_run"], categories=categories
        )
        verb = "Would change" if opts["dry_run"] else "Done"
        self.stdout.write(self.style.SUCCESS(
            f"{verb}: {stats['created']} new, {stats['updated']} updated, {stats['unchanged']} unchanged, "
            f"{stats['claimed']} claimed (left alone), {stats['skipped']} skipped (no name / no position)."
        ))
        self.stdout.write("Credit shown with these listings: (c) OpenStreetMap contributors.")
