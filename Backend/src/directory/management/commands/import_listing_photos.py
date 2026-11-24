"""Bulk-load photos for existing listings from a folder.

  python manage.py import_listing_photos --folder photos/ --dry-run     # check first, change nothing
  python manage.py import_listing_photos --folder photos/               # files named <listing id>.jpg (.png/.webp also fine)
  python manage.py import_listing_photos --folder photos/ --map map.csv # CSV with columns listing_id,file

Every photo is checked by its real bytes, shrunk to web size, re-encoded (which drops hidden GPS data) and stored in the
private bucket. Places that already have a photo are skipped unless you pass --replace. Only load photos you have the right
to use, such as ones your own team took, ones the owner supplied, or openly licensed images with their required
attribution preserved. Do not copy unlicensed photos from other websites."""
import csv
import uuid
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from directory import photos, storage
from directory.models import Listing


def _collect(folder: Path, map_path):
    """-> list of (listing_id, Path, problem). problem is None for a usable pair."""
    pairs = []
    if map_path:
        try:
            with open(map_path, newline="", encoding="utf-8-sig") as fh:
                reader = csv.DictReader(fh)
                if not reader.fieldnames or not {"listing_id", "file"} <= set(reader.fieldnames):
                    raise CommandError("The --map CSV needs a header row with the columns: listing_id,file")
                rows = list(reader)
        except OSError as exc:
            raise CommandError(f"Could not read {map_path}: {exc}")
        if not rows:
            raise CommandError("The --map CSV has no photo rows; there are no downloaded images to import.")
        for row in rows:
            raw_id = (row["listing_id"] or "").strip()
            name = (row["file"] or "").strip()
            target = (folder / name).resolve()
            if not raw_id.isdigit():
                pairs.append((None, name, f"listing_id '{raw_id}' is not a number"))
            elif folder.resolve() not in target.parents:
                pairs.append((int(raw_id), name, "the file path leaves the photo folder"))
            else:
                pairs.append((int(raw_id), target, None))
        return pairs
    for path in sorted(folder.iterdir()):
        if not path.is_file() or path.suffix.lower() not in photos.ALLOWED_EXTENSIONS:
            continue
        if not path.stem.isdigit():
            pairs.append((None, path.name, "the file name is not a listing id (expected 123.jpg)"))
        else:
            pairs.append((int(path.stem), path, None))
    return pairs


class Command(BaseCommand):
    help = "Bulk-import listing photos from a folder."

    def add_arguments(self, parser):
        parser.add_argument("--folder", required=True)
        parser.add_argument("--map", help="optional CSV: listing_id,file")
        parser.add_argument("--replace", action="store_true", help="replace photos that already exist")
        parser.add_argument("--dry-run", action="store_true", help="check everything, store nothing")

    def handle(self, *args, **opts):
        folder = Path(opts["folder"])
        if not folder.is_dir():
            raise CommandError(f"{folder} is not a folder.")
        stats = {"stored": 0, "skipped": 0, "failed": 0}
        problems = []
        seen = set()
        for listing_id, path, problem in _collect(folder, opts["map"]):
            label = path.name if isinstance(path, Path) else str(path)
            if problem:
                stats["failed"] += 1
                problems.append(f"{label}: {problem}")
                continue
            if listing_id in seen:
                stats["failed"] += 1
                problems.append(f"{label}: listing {listing_id} already has a photo in this batch")
                continue
            seen.add(listing_id)
            listing = Listing.objects.filter(pk=listing_id).first()
            if listing is None:
                stats["failed"] += 1
                problems.append(f"{label}: no listing with id {listing_id}")
                continue
            if listing.image_key and not opts["replace"]:
                stats["skipped"] += 1
                continue
            try:
                prepared = photos.prepare_photo(path.read_bytes())
            except OSError as exc:
                stats["failed"] += 1
                problems.append(f"{label}: could not read the file ({exc.__class__.__name__})")
                continue
            except photos.PhotoError as exc:
                stats["failed"] += 1
                problems.append(f"{label}: {exc}")
                continue
            if not opts["dry_run"]:
                key = f"directory/listings/{listing.id}/{uuid.uuid4().hex}.jpg"
                try:
                    storage.put_object(key, prepared, "image/jpeg")
                except storage.S3ImageStorageError as exc:
                    stats["failed"] += 1
                    problems.append(f"{label}: {exc}")
                    continue
                previous = listing.image_key
                listing.image_key = key
                listing.save(update_fields=["image_key", "updated_at"])
                if previous:
                    storage.delete_object(previous)
            stats["stored"] += 1

        verb = "Would store" if opts["dry_run"] else "Stored"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {stats['stored']} photo(s); {stats['skipped']} skipped (already have one); {stats['failed']} failed."
        ))
        for line in problems[:25]:
            self.stdout.write(f"  - {line}")
        if len(problems) > 25:
            self.stdout.write(f"  ... and {len(problems) - 25} more.")
