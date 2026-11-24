import csv
import io
import tempfile
from pathlib import Path
from unittest.mock import patch

from botocore.stub import Stubber
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings
from PIL import Image

from . import photos, storage
from .models import Listing


def make_image(size=(400, 300), fmt="JPEG", mode="RGB", color=(200, 30, 30), exif=None):
    image = Image.new(mode, size, color)
    out = io.BytesIO()
    kwargs = {"exif": exif} if exif is not None else {}
    image.save(out, format=fmt, **kwargs)
    return out.getvalue()


def exif_with_gps(orientation=1):
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"                      # Make
    exif[0x0112] = orientation                       # Orientation
    exif[0x8825] = {1: "N", 2: (9.0, 4.0, 30.0), 3: "E", 4: (7.0, 29.0, 40.0)}  # GPS position
    return exif


def reopen(data):
    return Image.open(io.BytesIO(data))


class PreparePhotoTests(TestCase):
    def test_big_photos_are_shrunk_to_1600_and_come_out_as_jpeg(self):
        out = photos.prepare_photo(make_image((4000, 3000)))
        image = reopen(out)
        self.assertEqual(image.format, "JPEG")
        self.assertEqual(image.size, (1600, 1200))
        self.assertLess(len(out), 600_000)

    def test_small_photos_are_never_enlarged(self):
        self.assertEqual(reopen(photos.prepare_photo(make_image((500, 400)))).size, (500, 400))

    def test_hidden_gps_and_other_metadata_are_removed(self):
        original = make_image((800, 600), exif=exif_with_gps())
        before = reopen(original).getexif()
        self.assertTrue(before.get_ifd(0x8825), "test setup: the source photo must carry a GPS position")
        out = photos.prepare_photo(original)
        after = reopen(out).getexif()
        self.assertEqual(dict(after), {})
        self.assertEqual(dict(after.get_ifd(0x8825)), {})
        self.assertNotIn(b"PhoneMaker", out)

    def test_rotation_tag_is_applied_before_it_is_dropped(self):
        # stored sideways (400 wide x 300 tall) with "rotate 90" -> should come out upright, 300 wide x 400 tall
        out = photos.prepare_photo(make_image((400, 300), exif=exif_with_gps(orientation=6)))
        self.assertEqual(reopen(out).size, (300, 400))

    def test_transparent_png_is_flattened_onto_white(self):
        out = photos.prepare_photo(make_image((50, 50), fmt="PNG", mode="RGBA", color=(255, 0, 0, 0)))
        r, g, b = reopen(out).convert("RGB").getpixel((25, 25))
        self.assertGreater(min(r, g, b), 240)   # white, not black

    def test_png_webp_cmyk_and_palette_images_all_work(self):
        for fmt, mode in (("PNG", "RGB"), ("WEBP", "RGB"), ("JPEG", "CMYK"), ("PNG", "P")):
            out = photos.prepare_photo(make_image((100, 80), fmt=fmt, mode=mode, color=0 if mode == "P" else (10, 20, 30)
                                                  if mode != "CMYK" else (0, 0, 0, 0)))
            self.assertEqual(reopen(out).format, "JPEG", (fmt, mode))

    def test_things_that_are_not_images_are_refused_whatever_they_are_called(self):
        for data in (b"<html><script>alert(1)</script></html>", b"<svg xmlns='http://www.w3.org/2000/svg'/>", b"%PDF-1.7 ...", b"GIF89a....."):
            with self.assertRaisesRegex(photos.PhotoError, "not a JPEG, PNG or WebP"):
                photos.prepare_photo(data)
        with self.assertRaisesRegex(photos.PhotoError, "empty"):
            photos.prepare_photo(b"")

    def test_a_truncated_or_corrupt_image_is_refused_cleanly(self):
        good = make_image((600, 400))
        with self.assertRaisesRegex(photos.PhotoError, "could not be read"):
            photos.prepare_photo(good[: len(good) // 3])
        with self.assertRaisesRegex(photos.PhotoError, "could not be read"):
            photos.prepare_photo(b"\xff\xd8\xff\xe0" + b"garbage" * 50)

    def test_oversized_files_and_pixel_bombs_are_refused(self):
        with patch.object(photos, "MAX_INPUT_BYTES", 1000), self.assertRaisesRegex(photos.PhotoError, "25 MB"):
            photos.prepare_photo(make_image((600, 400)))
        with patch.object(photos, "MAX_PIXELS", 1000), self.assertRaisesRegex(photos.PhotoError, "could not be read"):
            photos.prepare_photo(make_image((600, 400)))


class ImportCommandTests(TestCase):
    def setUp(self):
        mk = lambda name, **kw: Listing.objects.create(name=name, category="restaurants", address="Wuse 2", city="Abuja", phone="",
                                                       status="approved", **kw)
        self.a, self.b, self.c = mk("Alpha"), mk("Beta"), mk("Gamma")
        self.folder = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: [p.unlink() for p in self.folder.glob("*")] and self.folder.rmdir())
        patcher = patch("directory.storage.put_object")
        self.put = patcher.start()
        self.addCleanup(patcher.stop)
        deleter = patch("directory.storage.delete_object")
        self.delete = deleter.start()
        self.addCleanup(deleter.stop)

    def save(self, name, data):
        (self.folder / name).write_bytes(data)

    def run_import(self, *extra):
        out = io.StringIO()
        call_command("import_listing_photos", "--folder", str(self.folder), *extra, stdout=out)
        return out.getvalue()

    def test_files_named_by_listing_id_are_stored_privately_and_attached(self):
        self.save(f"{self.a.id}.jpg", make_image((2000, 1500), exif=exif_with_gps()))
        self.save(f"{self.b.id}.PNG", make_image((300, 300), fmt="PNG"))
        text = self.run_import()
        self.assertIn("Stored 2 photo(s)", text)
        self.assertEqual(self.put.call_count, 2)
        key, data, content_type = self.put.call_args_list[0][0]
        self.assertRegex(key, rf"^directory/listings/{self.a.id}/[0-9a-f]{{32}}\.jpg$")
        self.assertEqual(content_type, "image/jpeg")
        self.assertEqual(reopen(data).size, (1600, 1200))
        self.assertEqual(dict(reopen(data).getexif()), {})            # what was uploaded carries no GPS
        self.a.refresh_from_db()
        self.assertEqual(self.a.image_key, key)

    def test_dry_run_checks_everything_but_stores_nothing(self):
        self.save(f"{self.a.id}.jpg", make_image())
        self.save(f"{self.b.id}.jpg", b"<html>not a photo</html>")
        text = self.run_import("--dry-run")
        self.assertIn("Would store 1 photo(s)", text)
        self.assertIn("1 failed", text)
        self.put.assert_not_called()
        self.a.refresh_from_db()
        self.assertEqual(self.a.image_key, "")

    def test_places_with_a_photo_are_skipped_unless_replace_is_given(self):
        Listing.objects.filter(pk=self.a.pk).update(image_key=f"directory/listings/{self.a.id}/{'1' * 32}.jpg")
        self.save(f"{self.a.id}.jpg", make_image())
        self.assertIn("1 skipped", self.run_import())
        self.put.assert_not_called()
        self.assertIn("Stored 1 photo(s)", self.run_import("--replace"))
        self.delete.assert_called_once_with(f"directory/listings/{self.a.id}/{'1' * 32}.jpg")   # the old one is cleaned up
        self.a.refresh_from_db()
        self.assertNotEqual(self.a.image_key, f"directory/listings/{self.a.id}/{'1' * 32}.jpg")

    def test_every_kind_of_bad_file_is_reported_by_name_and_the_rest_still_load(self):
        self.save(f"{self.a.id}.jpg", make_image())
        self.save("99999.jpg", make_image())                       # no such listing
        self.save("menu.jpg", make_image())                        # name is not an id
        self.save(f"{self.b.id}.jpg", b"%PDF-1.7 pretending")      # not an image
        self.save(f"{self.c.id}.txt", b"hello")                    # not a photo extension: ignored silently
        text = self.run_import()
        self.assertIn("Stored 1 photo(s)", text)
        self.assertIn("3 failed", text)
        self.assertIn("99999.jpg: no listing with id 99999", text)
        self.assertIn("menu.jpg: the file name is not a listing id", text)
        self.assertIn(f"{self.b.id}.jpg: not a JPEG, PNG or WebP", text)
        self.assertNotIn("txt", text)

    def test_a_storage_failure_on_one_photo_does_not_stop_the_batch(self):
        self.save(f"{self.a.id}.jpg", make_image())
        self.save(f"{self.b.id}.jpg", make_image())
        self.put.side_effect = [storage.S3ImageStorageError("Could not store the image."), None]
        text = self.run_import()
        self.assertIn("Stored 1 photo(s)", text)
        self.assertIn("1 failed", text)
        self.a.refresh_from_db()
        self.b.refresh_from_db()
        self.assertEqual((self.a.image_key, bool(self.b.image_key)), ("", True))   # the failed one was NOT marked as having a photo

    def test_a_map_file_lets_photos_keep_their_own_names(self):
        self.save("front-of-alpha.jpg", make_image())
        mapfile = self.folder / "map.csv"
        with open(mapfile, "w", newline="") as fh:
            csv.writer(fh).writerows([["listing_id", "file"], [self.a.id, "front-of-alpha.jpg"], ["abc", "x.jpg"],
                                      [self.b.id, "../../etc/passwd"]])
        text = self.run_import("--map", str(mapfile))
        self.assertIn("Stored 1 photo(s)", text)
        self.assertIn("listing_id 'abc' is not a number", text)
        self.assertIn("leaves the photo folder", text)             # a path like ../../etc/passwd can never be read
        mapfile.unlink()

    def test_a_bad_map_file_or_folder_is_a_clear_error(self):
        with self.assertRaises(CommandError):
            call_command("import_listing_photos", "--folder", "/no/such/folder")
        bad = self.folder / "bad.csv"
        bad.write_text("id,photo\n1,a.jpg\n")
        with self.assertRaisesRegex(CommandError, "listing_id,file"):
            self.run_import("--map", str(bad))
        bad.unlink()

    def test_two_files_for_one_listing_load_only_the_first(self):
        self.save(f"{self.a.id}.jpg", make_image())
        mapfile = self.folder / "map.csv"
        self.save("second.jpg", make_image())
        with open(mapfile, "w", newline="") as fh:
            csv.writer(fh).writerows([["listing_id", "file"], [self.a.id, f"{self.a.id}.jpg"], [self.a.id, "second.jpg"]])
        text = self.run_import("--map", str(mapfile))
        self.assertIn("Stored 1 photo(s)", text)
        self.assertIn("already has a photo in this batch", text)
        self.assertEqual(self.put.call_count, 1)
        mapfile.unlink()


class WorklistTests(TestCase):
    def setUp(self):
        def mk(name, **kw):
            fields = {"category": "restaurants", "status": "approved", **kw}
            return Listing.objects.create(name=name, address="x", phone="0800", **fields)
        self.needs = mk("Needs Photo", city="Abuja", latitude=9.0765, longitude=7.4951)
        mk("No Position", city="Abuja")
        mk("Has Photo", city="Abuja", image_key="directory/listings/1/a.jpg")
        mk("Other City", city="Lagos")
        mk("A School", category="schools", city="Abuja")
        mk("Pending Place", city="Abuja", status="pending")

    def export(self, *args):
        out = io.StringIO()
        call_command("export_photo_worklist", *args, stdout=out)
        return list(csv.DictReader(io.StringIO(out.getvalue())))

    def test_lists_only_approved_restaurants_without_photos_by_default(self):
        names = sorted(r["name"] for r in self.export())
        # not the school (wrong category), not the one with a photo, not the pending one
        self.assertEqual(names, ["Needs Photo", "No Position", "Other City"])
        self.assertTrue(all(r["has_photo"] == "no" for r in self.export()))

    def test_filters_and_columns(self):
        rows = self.export("--city", "abuja")
        self.assertEqual({r["name"] for r in rows}, {"Needs Photo", "No Position"})
        first = next(r for r in rows if r["name"] == "Needs Photo")
        self.assertEqual(first["id"], str(self.needs.id))
        self.assertEqual(first["maps_link"], "https://www.google.com/maps/search/?api=1&query=9.0765,7.4951")
        self.assertEqual(next(r for r in rows if r["name"] == "No Position")["maps_link"], "")
        self.assertEqual({r["name"] for r in self.export("--category", "schools")}, {"A School"})
        self.assertIn("Has Photo", {r["name"] for r in self.export("--include-with-photo")})
        self.assertEqual(len(self.export("--limit", "1")), 1)
        self.assertEqual({r["name"] for r in self.export("--category", "all", "--city", "Abuja")},
                         {"Needs Photo", "No Position", "A School"})

    def test_can_write_to_a_file(self):
        path = Path(tempfile.mkdtemp()) / "list.csv"
        out = io.StringIO()
        call_command("export_photo_worklist", "--out", str(path), stdout=out)
        self.assertIn("Wrote 3 place(s)", out.getvalue())
        self.assertEqual(path.read_text().splitlines()[0], "id,name,category,address,city,phone,latitude,longitude,maps_link,has_photo")
        path.unlink()
        path.parent.rmdir()


@override_settings(AWS_STORAGE_BUCKET_NAME="test-bucket", AWS_ACCESS_KEY_ID="AKIATEST", AWS_SECRET_ACCESS_KEY="secret",
                   AWS_S3_ENDPOINT_URL="https://storage.example.com", AWS_S3_REGION_NAME="auto", AWS_S3_ADDRESSING_STYLE="path")
class PutObjectTests(TestCase):
    """What the importer really sends to the bucket (real boto3 client, no network)."""

    def test_sends_the_bytes_with_the_right_key_and_type(self):
        stub = Stubber(storage._configured_client())
        stub.add_response("put_object", {}, {"Bucket": "test-bucket", "Key": "directory/listings/1/a.jpg",
                                              "Body": b"JPEGBYTES", "ContentType": "image/jpeg"})
        with stub:
            storage.put_object("directory/listings/1/a.jpg", b"JPEGBYTES", "image/jpeg")
        stub.assert_no_pending_responses()

    def test_storage_errors_become_a_clear_error_not_a_crash(self):
        stub = Stubber(storage._configured_client())
        stub.add_client_error("put_object", service_error_code="AccessDenied", http_status_code=403)
        with stub, self.assertLogs("directory.storage", "ERROR"), self.assertRaises(storage.S3ImageStorageError):
            storage.put_object("k.jpg", b"x", "image/jpeg")

    @override_settings(AWS_STORAGE_BUCKET_NAME=None, AWS_ACCESS_KEY_ID=None, AWS_SECRET_ACCESS_KEY=None)
    def test_unconfigured_storage_is_reported_not_attempted(self):
        with self.assertRaises(storage.S3ImageStorageError):
            storage.put_object("k.jpg", b"x", "image/jpeg")

