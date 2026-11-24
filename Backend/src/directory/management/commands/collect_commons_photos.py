"""Download openly licensed Wikimedia Commons photo candidates for directory listings.

The results are a review pack, not an automatic listing-photo import. Check each match
and retain its manifest attribution before using it in the application.
"""
import csv
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from directory import photos
from directory.models import Listing

API_URL = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "ThekapitaDirectoryPhotoCollector/1.0 (directory photo review)"
MAX_API_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BYTES = photos.MAX_INPUT_BYTES
LICENSE_PATH = re.compile(
    r"^/licenses/(by|by-sa)/(1\.0|2\.0|2\.5|3\.0|4\.0)/?$", re.IGNORECASE
)
PD_PATH = re.compile(r"^/publicdomain/(zero|mark)/(1\.0)?/?$", re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]*>")
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]+")
MANIFEST_FIELDS = (
    "listing_id",
    "listing_name",
    "candidate_file",
    "commons_title",
    "source_url",
    "license",
    "license_url",
    "artist",
    "credit",
    "attribution_required",
)


class CommonsError(Exception):
    """A Commons response or image cannot be safely used."""


def _allowed_url(url, hosts):
    parsed = urllib.parse.urlparse(url or "")
    return parsed.scheme == "https" and parsed.hostname in hosts


def _request(url, max_bytes):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json, image/*"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            final_url = response.geturl()
            hosts = {"commons.wikimedia.org", "upload.wikimedia.org"}
            if not _allowed_url(final_url, hosts):
                raise CommonsError("Wikimedia redirected to an untrusted host.")
            data = response.read(max_bytes + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise CommonsError(f"Could not retrieve a Commons response ({exc.__class__.__name__}).") from exc
    if len(data) > max_bytes:
        raise CommonsError("The Commons response exceeds the permitted size.")
    return data


def _license_metadata(metadata):
    license_url = (metadata.get("LicenseUrl") or {}).get("value", "").strip()
    parsed = urllib.parse.urlparse(license_url)
    if parsed.scheme != "https" or parsed.hostname != "creativecommons.org":
        return None
    if not (LICENSE_PATH.fullmatch(parsed.path) or PD_PATH.fullmatch(parsed.path)):
        return None
    return {
        "license": _plain((metadata.get("LicenseShortName") or {}).get("value", "")),
        "license_url": license_url,
        "artist": _plain((metadata.get("Artist") or {}).get("value", "")),
        "credit": _plain((metadata.get("Credit") or {}).get("value", "")),
        "attribution_required": _plain((metadata.get("AttributionRequired") or {}).get("value", "")),
    }


def _plain(value):
    return CONTROL_RE.sub(" ", html.unescape(TAG_RE.sub("", str(value or "")))).strip()


def _search_url(name):
    query = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "generator": "search",
        "gsrnamespace": "6",
        "gsrsearch": f'filetype:bitmap "{name}"',
        "gsrlimit": "10",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": "1200",
    })
    return f"{API_URL}?{query}"


def _candidate_pages(data):
    try:
        payload = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CommonsError("Commons returned invalid JSON.") from exc
    pages = payload.get("query", {}).get("pages", [])
    if not isinstance(pages, list):
        raise CommonsError("Commons returned an unexpected search response.")
    return sorted(pages, key=lambda page: page.get("index", 0))


def _file_url(info):
    url = info.get("thumburl") or info.get("url") or ""
    if not _allowed_url(url, {"upload.wikimedia.org"}):
        raise CommonsError("Commons returned a file URL outside upload.wikimedia.org.")
    return url


class Command(BaseCommand):
    help = "Download openly licensed Commons photo candidates for approved listings without photos."

    def add_arguments(self, parser):
        parser.add_argument("--category", default="all", help="listing category, or 'all' (default: all)")
        parser.add_argument("--city", default="", help="only this city")
        parser.add_argument("--limit", type=int, default=100, help="at most this many listings (0 = no limit)")
        parser.add_argument("--max-results", type=int, default=2, help="licensed candidates per listing (1-5)")
        parser.add_argument("--delay", type=float, default=1.0, help="seconds between Commons requests")
        parser.add_argument("--output-dir", required=True, help="new or empty folder for images and manifest.csv")

    def handle(self, *args, **opts):
        if opts["limit"] < 0:
            raise CommandError("--limit cannot be negative.")
        if not 1 <= opts["max_results"] <= 5:
            raise CommandError("--max-results must be between 1 and 5.")
        if opts["delay"] < 0:
            raise CommandError("--delay cannot be negative.")

        output = Path(opts["output_dir"])
        output.mkdir(parents=True, exist_ok=True)
        manifest_path = output / "manifest.csv"
        if manifest_path.exists() or any(output.iterdir()):
            raise CommandError(f"{output} must be empty; refusing to overwrite existing files.")

        listings = Listing.objects.filter(status=Listing.Status.APPROVED, image_key="")
        if opts["category"] != "all":
            listings = listings.filter(category=opts["category"])
        if opts["city"]:
            listings = listings.filter(city__iexact=opts["city"])
        listings = listings.order_by("city", "name", "id")
        if opts["limit"]:
            listings = listings[:opts["limit"]]

        stats = {"downloaded": 0, "no_match": 0, "failed": 0}
        with manifest_path.open("w", newline="", encoding="utf-8-sig") as manifest:
            writer = csv.DictWriter(manifest, fieldnames=MANIFEST_FIELDS)
            writer.writeheader()
            for listing in listings.iterator():
                if stats["downloaded"] or stats["no_match"] or stats["failed"]:
                    time.sleep(opts["delay"])
                try:
                    search_data = _request(_search_url(listing.name), MAX_API_BYTES)
                    pages = _candidate_pages(search_data)
                except CommonsError as exc:
                    stats["failed"] += 1
                    self.stderr.write(f"Listing {listing.id} ({listing.name}): {exc}")
                    continue

                matched = 0
                for page in pages:
                    if matched >= opts["max_results"]:
                        break
                    info = (page.get("imageinfo") or [{}])[0]
                    metadata = _license_metadata(info.get("extmetadata") or {})
                    if metadata is None:
                        continue
                    source_url = page.get("canonicalurl") or page.get("fullurl") or ""
                    if not _allowed_url(source_url, {"commons.wikimedia.org"}):
                        continue
                    try:
                        image_url = _file_url(info)
                        image_data = _request(image_url, MAX_IMAGE_BYTES)
                        prepared = photos.prepare_photo(image_data)
                    except (CommonsError, photos.PhotoError) as exc:
                        stats["failed"] += 1
                        self.stderr.write(f"Listing {listing.id}, {page.get('title', 'candidate')}: {exc}")
                        continue

                    listing_dir = output / str(listing.id)
                    listing_dir.mkdir(exist_ok=True)
                    candidate_file = f"{listing.id}/{matched + 1:03d}.jpg"
                    destination = output / candidate_file
                    if destination.exists():
                        raise CommandError(f"Refusing to overwrite {destination}.")
                    destination.write_bytes(prepared)
                    writer.writerow({
                        "listing_id": listing.id,
                        "listing_name": _plain(listing.name),
                        "candidate_file": candidate_file,
                        "commons_title": _plain(page.get("title", "")),
                        "source_url": source_url,
                        **metadata,
                    })
                    matched += 1
                    stats["downloaded"] += 1
                    if opts["delay"] and matched < opts["max_results"]:
                        time.sleep(opts["delay"])
                if not matched:
                    stats["no_match"] += 1

        self.stdout.write(self.style.SUCCESS(
            f"Downloaded {stats['downloaded']} licensed candidate(s); "
            f"{stats['no_match']} listing(s) had no eligible match; {stats['failed']} request(s) failed. "
            f"Review images and attribution in {manifest_path}."
        ))
