import csv
import io
import json
import tempfile
import urllib.error
from pathlib import Path
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import TestCase
from PIL import Image

from .models import Listing


def jpeg_bytes():
    image = Image.new("RGB", (4, 4), (30, 80, 120))
    data = io.BytesIO()
    image.save(data, format="JPEG")
    return data.getvalue()


class CollectCommonsPhotosTests(TestCase):
    def setUp(self):
        self.listing = Listing.objects.create(
            name="Example Hospital",
            category=Listing.Category.HOSPITALS,
            address="Abuja",
            city="Abuja",
            phone="",
            status=Listing.Status.APPROVED,
        )

    def test_downloads_only_allowed_license_and_records_attribution(self):
        response = {
            "query": {
                "pages": [
                    {
                        "index": 1,
                        "title": "File:Noncommercial.jpg",
                        "canonicalurl": "https://commons.wikimedia.org/wiki/File:Noncommercial.jpg",
                        "imageinfo": [{
                            "thumburl": "https://upload.wikimedia.org/noncommercial.jpg",
                            "extmetadata": {
                                "LicenseShortName": {"value": "CC BY-NC 4.0"},
                                "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-nc/4.0/"},
                            },
                        }],
                    },
                    {
                        "index": 2,
                        "title": "File:Hospital.jpg",
                        "canonicalurl": "https://commons.wikimedia.org/wiki/File:Hospital.jpg",
                        "imageinfo": [{
                            "thumburl": "https://upload.wikimedia.org/hospital.jpg",
                            "extmetadata": {
                                "LicenseShortName": {"value": "CC BY-SA 4.0"},
                                "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/4.0/"},
                                "Artist": {"value": "<a href='/wiki/User:Example'>Example Artist</a>"},
                                "Credit": {"value": "Example collection"},
                                "AttributionRequired": {"value": "true"},
                            },
                        }],
                    },
                ],
            },
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch(
                "directory.management.commands.collect_commons_photos._request",
                side_effect=[json.dumps(response).encode(), jpeg_bytes()],
            ) as request, patch("directory.management.commands.collect_commons_photos.time.sleep"):
                call_command(
                    "collect_commons_photos",
                    output_dir=temp_dir,
                    city="Abuja",
                    delay=0,
                    stdout=io.StringIO(),
                )

            self.assertEqual(request.call_count, 2)
            image_path = Path(temp_dir) / str(self.listing.id) / "001.jpg"
            self.assertTrue(image_path.is_file())
            with open(Path(temp_dir) / "manifest.csv", newline="", encoding="utf-8-sig") as file:
                row = next(csv.DictReader(file))
            with open(Path(temp_dir) / "import-map.csv", newline="", encoding="utf-8-sig") as file:
                import_row = next(csv.DictReader(file))
            self.assertEqual(row["license"], "CC BY-SA 4.0")
            self.assertEqual(row["artist"], "Example Artist")
            self.assertEqual(row["source_url"], "https://commons.wikimedia.org/wiki/File:Hospital.jpg")
            self.assertEqual(row["attribution_required"], "true")
            self.assertEqual(import_row, {
                "listing_id": str(self.listing.id),
                "file": f"{self.listing.id}/001.jpg",
            })
            with patch("directory.storage.put_object") as put_object:
                call_command(
                    "import_listing_photos",
                    folder=temp_dir,
                    map=Path(temp_dir) / "import-map.csv",
                    stdout=io.StringIO(),
                )
            self.listing.refresh_from_db()
            self.assertRegex(self.listing.image_key, rf"^directory/listings/{self.listing.id}/[0-9a-f]{{32}}\.jpg$")
            put_object.assert_called_once()

    def test_rejects_non_commons_download_hosts(self):
        from .management.commands.collect_commons_photos import CommonsError, _file_url

        with self.assertRaises(CommonsError):
            _file_url({"thumburl": "https://example.com/image.jpg"})

    def test_accepts_wikimedia_thumbnail_urls(self):
        from .management.commands import collect_commons_photos as collector

        url = "https://thumb.wikimedia.org/wikipedia/commons/thumb/example.jpg"
        self.assertEqual(collector._file_url({"thumburl": url}), url)

        class Response(io.BytesIO):
            def geturl(self):
                return url

        with patch.object(collector.urllib.request, "urlopen", return_value=Response(b"jpeg")):
            self.assertEqual(collector._request(url, 1024), b"jpeg")

    def test_empty_commons_search_response_means_no_results(self):
        from .management.commands.collect_commons_photos import _candidate_pages

        self.assertEqual(_candidate_pages(b'{"batchcomplete":true}'), [])

    def test_http_errors_report_status_and_response_body(self):
        from .management.commands import collect_commons_photos as collector

        error = urllib.error.HTTPError(
            collector.API_URL, 403, "Forbidden", {}, io.BytesIO(b"request blocked")
        )
        with patch.object(collector.urllib.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(collector.CommonsError, "HTTP 403 Forbidden.*request blocked"):
                collector._request(collector.API_URL, 1024)

    def test_rate_limit_response_retries_after_the_server_delay(self):
        from .management.commands import collect_commons_photos as collector

        class Response(io.BytesIO):
            def geturl(self):
                return collector.API_URL

        limited = urllib.error.HTTPError(
            collector.API_URL, 429, "Too Many Requests", {"Retry-After": "0"}, io.BytesIO()
        )
        with patch.object(collector.urllib.request, "urlopen", side_effect=[limited, Response(b"ok")]), \
                patch.object(collector.time, "sleep") as sleep:
            self.assertEqual(collector._request(collector.API_URL, 1024), b"ok")
        sleep.assert_called_once_with(0.0)

    def test_api_rate_limit_error_is_retryable_and_explained(self):
        from .management.commands import collect_commons_photos as collector

        with self.assertRaises(collector.CommonsError) as raised:
            collector._candidate_pages(
                b'{"error":{"code":"ratelimited","info":"Wait before retrying."}}'
            )
        self.assertTrue(raised.exception.retryable)
        self.assertIn("Wait before retrying", str(raised.exception))

    def test_header_only_import_map_reports_that_no_images_were_downloaded(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            map_path = Path(temp_dir) / "import-map.csv"
            map_path.write_text("listing_id,file\n", encoding="utf-8")
            with self.assertRaisesRegex(CommandError, "no photo rows"):
                call_command("import_listing_photos", folder=temp_dir, map=map_path)
