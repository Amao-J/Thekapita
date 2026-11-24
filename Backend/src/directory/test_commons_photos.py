import csv
import io
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command
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
