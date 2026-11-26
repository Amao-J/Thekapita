"""Download openly licensed Wikimedia Commons candidates and prepare an import map.

Review the suggested matches and manifest attribution before importing any image.
"""
import csv
import html
import json
import math
import re
import time
from email.utils import parsedate_to_datetime
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from directory import photos
from directory.models import Listing

API_URL = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "ThekapitaDirectoryPhotoCollector/1.1 (+https://thekapita.com/)"
COMMONS_API_HOST = "commons.wikimedia.org"
COMMONS_IMAGE_HOSTS = {"upload.wikimedia.org", "thumb.wikimedia.org"}
COMMONS_HOSTS = COMMONS_IMAGE_HOSTS | {COMMONS_API_HOST}
MAX_API_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BYTES = photos.MAX_INPUT_BYTES
MAX_REQUEST_ATTEMPTS = 4
MAX_RETRY_DELAY_SECONDS = 120
RETRYABLE_HTTP_STATUSES = {429, 500, 502, 503, 504}
RETRYABLE_API_ERRORS = {"maxlag", "ratelimited"}
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
IMPORT_MAP_FIELDS = ("listing_id", "file")


class CommonsError(Exception):
    """A Commons response or image cannot be safely used."""

    def __init__(self, message, retryable=False):
        super().__init__(message)
        self.retryable = retryable


def _allowed_url(url, hosts):
    parsed = urllib.parse.urlparse(url or "")
    return parsed.scheme == "https" and parsed.hostname in hosts


def _retry_delay(headers, attempt):
    retry_after = headers.get("Retry-After") if headers else None
    if retry_after:
        try:
            delay = float(retry_after)
            if not math.isfinite(delay):
                raise ValueError("Retry-After is not finite")
            return min(max(delay, 0), MAX_RETRY_DELAY_SECONDS)
        except ValueError:
            try:
                delay = parsedate_to_datetime(retry_after).timestamp() - time.time()
                return min(max(delay, 0), MAX_RETRY_DELAY_SECONDS)
            except (TypeError, ValueError, OverflowError):
                pass
    return min(2 ** attempt, MAX_RETRY_DELAY_SECONDS)


def _request(url, max_bytes):
    initial_host = urllib.parse.urlparse(url).hostname
    if initial_host not in COMMONS_HOSTS:
        raise CommonsError("Refusing to contact a host outside Wikimedia Commons.")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json, image/*"},
    )
    for attempt in range(MAX_REQUEST_ATTEMPTS):
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                final_url = response.geturl()
                allowed_redirect_hosts = (
                    {COMMONS_API_HOST} if initial_host == COMMONS_API_HOST else COMMONS_IMAGE_HOSTS
                )
                if not _allowed_url(final_url, allowed_redirect_hosts):
                    raise CommonsError("Wikimedia redirected to an untrusted host.")
                data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise CommonsError("The Commons response exceeds the permitted size.")
            return data
        except urllib.error.HTTPError as exc:
            if exc.code in RETRYABLE_HTTP_STATUSES and attempt + 1 < MAX_REQUEST_ATTEMPTS:
                time.sleep(_retry_delay(exc.headers, attempt))
                continue
            body = exc.read(400).decode("utf-8", errors="replace").strip()
            detail = f": {body}" if body else ""
            raise CommonsError(
                f"Commons returned HTTP {exc.code} {exc.reason}{detail}"
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if attempt + 1 < MAX_REQUEST_ATTEMPTS:
                time.sleep(_retry_delay(None, attempt))
                continue
            reason = getattr(exc, "reason", exc)
            raise CommonsError(
                f"Could not retrieve a Commons response after {MAX_REQUEST_ATTEMPTS} attempts "
                f"({reason})."
            ) from exc
    raise CommonsError("Could not retrieve a Commons response.")


def _license_metadata(metadata):
    if not isinstance(metadata, dict):
        return None

    def value(key):
        entry = metadata.get(key)
        return entry.get("value", "") if isinstance(entry, dict) else ""

    license_url = value("LicenseUrl").strip()
    parsed = urllib.parse.urlparse(license_url)
    if parsed.scheme != "https" or parsed.hostname != "creativecommons.org":
        return None
    if not (LICENSE_PATH.fullmatch(parsed.path) or PD_PATH.fullmatch(parsed.path)):
        return None
    return {
        "license": _plain(value("LicenseShortName")),
        "license_url": license_url,
        "artist": _plain(value("Artist")),
        "credit": _plain(value("Credit")),
        "attribution_required": _plain(value("AttributionRequired")),
    }


def _plain(value):
    return CONTROL_RE.sub(" ", html.unescape(TAG_RE.sub("", str(value or "")))).strip()


def _search_url(name):
    query = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "maxlag": "5",
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
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict):
        code = _plain(error.get("code", "unknown"))
        info = _plain(error.get("info", ""))
        detail = f": {info}" if info else ""
        raise CommonsError(
            f"Commons API error {code}{detail}",
            retryable=code in RETRYABLE_API_ERRORS,
        )
    if isinstance(payload, dict) and "query" not in payload and payload.get("batchcomplete") is True:
        return []
    if not isinstance(payload, dict) or not isinstance(payload.get("query"), dict):
        raise CommonsError("Commons returned an unexpected search response.")
    pages = payload["query"].get("pages", [])
    if not isinstance(pages, list) or not all(isinstance(page, dict) for page in pages):
        raise CommonsError("Commons returned an unexpected search response.")
    return sorted(pages, key=lambda page: page.get("index", 0) if isinstance(page.get("index", 0), int) else 0)


def _search_pages(name):
    for attempt in range(MAX_REQUEST_ATTEMPTS):
        try:
            return _candidate_pages(_request(_search_url(name), MAX_API_BYTES))
        except CommonsError as exc:
            if not exc.retryable or attempt + 1 >= MAX_REQUEST_ATTEMPTS:
                raise
            time.sleep(_retry_delay(None, attempt))
    raise CommonsError("Could not complete the Commons search.")


def _file_url(info):
    url = info.get("thumburl") or info.get("url") or ""
    if not _allowed_url(url, COMMONS_IMAGE_HOSTS):
        raise CommonsError("Commons returned a file URL outside Wikimedia's image hosts.")
    return url


def _csv_safe(value):
    text = str(value or "")
    return f"'{text}" if text.startswith(("=", "+", "-", "@")) else text


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
        if output.exists() and not output.is_dir():
            raise CommandError(f"{output} is not a folder.")
        output.mkdir(parents=True, exist_ok=True)
        manifest_path = output / "manifest.csv"
        import_map_path = output / "import-map.csv"
        if manifest_path.exists() or import_map_path.exists() or any(output.iterdir()):
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
        with manifest_path.open("w", newline="", encoding="utf-8-sig") as manifest, \
                import_map_path.open("w", newline="", encoding="utf-8-sig") as import_map:
            writer = csv.DictWriter(manifest, fieldnames=MANIFEST_FIELDS)
            map_writer = csv.DictWriter(import_map, fieldnames=IMPORT_MAP_FIELDS)
            writer.writeheader()
            map_writer.writeheader()
            for listing in listings.iterator():
                if stats["downloaded"] or stats["no_match"] or stats["failed"]:
                    time.sleep(opts["delay"])
                try:
                    pages = _search_pages(listing.name)
                except CommonsError as exc:
                    stats["failed"] += 1
                    self.stderr.write(f"Listing {listing.id} ({listing.name}): {exc}")
                    continue

                matched = 0
                eligible = 0
                for page in pages:
                    if matched >= opts["max_results"]:
                        break
                    imageinfo = page.get("imageinfo")
                    if not isinstance(imageinfo, list) or not imageinfo or not isinstance(imageinfo[0], dict):
                        continue
                    info = imageinfo[0]
                    metadata = _license_metadata(info.get("extmetadata") or {})
                    if metadata is None:
                        continue
                    source_url = page.get("canonicalurl") or page.get("fullurl") or ""
                    if not _allowed_url(source_url, {"commons.wikimedia.org"}):
                        continue
                    eligible += 1
                    try:
                        image_url = _file_url(info)
                        if opts["delay"]:
                            time.sleep(opts["delay"])
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
                        key: _csv_safe(value) for key, value in {
                            "listing_id": listing.id,
                            "listing_name": _plain(listing.name),
                            "candidate_file": candidate_file,
                            "commons_title": _plain(page.get("title", "")),
                            "source_url": source_url,
                            **metadata,
                        }.items()
                    })
                    if matched == 0:
                        map_writer.writerow({"listing_id": listing.id, "file": candidate_file})
                    matched += 1
                    stats["downloaded"] += 1
                if not eligible:
                    stats["no_match"] += 1

        self.stdout.write(self.style.SUCCESS(
            f"Downloaded {stats['downloaded']} licensed candidate(s); "
            f"{stats['no_match']} listing(s) had no eligible match; {stats['failed']} candidate(s) failed. "
            f"Review images and attribution in {manifest_path}; selected candidates are mapped in {import_map_path}."
        ))
