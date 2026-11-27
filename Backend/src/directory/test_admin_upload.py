from unittest.mock import patch

from django.contrib.messages.storage.fallback import FallbackStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.forms import modelform_factory
from django.test import RequestFactory, TestCase

from . import storage
from .admin_upload import PhotoUploadForm, save_uploaded_photo
from .models import Listing

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
Form = modelform_factory(Listing, form=PhotoUploadForm, fields=["name"])


def request():
    req = RequestFactory().post("/")
    req.session = {}
    req._messages = FallbackStorage(req)
    return req


def bound(photo=None, **data):
    return Form(data={"name": "x", **data}, files={"photo": photo} if photo else {})


class AdminPhotoUpload(TestCase):
    def setUp(self):
        self.listing = Listing.objects.create(name="Iya Bisi", category="restaurants", address="a", phone="0")

    def test_accepts_a_real_image_whatever_its_name(self):
        form = bound(SimpleUploadedFile("pic.txt", JPEG, "text/plain"))
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["photo"].detected_type, "image/jpeg")

    def test_rejects_a_file_that_is_not_an_image(self):
        form = bound(SimpleUploadedFile("pic.jpg", b"<html>not an image</html>", "image/jpeg"))
        self.assertFalse(form.is_valid())
        self.assertIn("photo", form.errors)

    def test_rejects_oversized_files(self):
        with patch.object(storage, "MAX_IMAGE_BYTES", 10):
            self.assertFalse(bound(SimpleUploadedFile("a.jpg", JPEG, "image/jpeg")).is_valid())

    def test_upload_goes_to_the_bucket_under_the_listing_prefix_and_replaces_the_old_photo(self):
        self.listing.image_key = "directory/listings/1/old.jpg"
        self.listing.save()
        form = bound(SimpleUploadedFile("a.jpg", JPEG, "image/jpeg"))
        form.is_valid()
        with patch.object(storage, "put_object") as put, patch.object(storage, "delete_object") as delete:
            save_uploaded_photo(request(), self.listing, form, f"directory/listings/{self.listing.id}")
        key = put.call_args.args[0]
        self.assertRegex(key, rf"^directory/listings/{self.listing.id}/[0-9a-f]{{32}}\.jpg$")
        self.assertEqual(put.call_args.args[2], "image/jpeg")
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.image_key, key)
        delete.assert_called_once_with("directory/listings/1/old.jpg")

    def test_bucket_failure_keeps_the_old_photo(self):
        self.listing.image_key = "directory/listings/1/old.jpg"
        self.listing.save()
        form = bound(SimpleUploadedFile("a.jpg", JPEG, "image/jpeg"))
        form.is_valid()
        with patch.object(storage, "put_object", side_effect=storage.S3ImageStorageError("down")):
            save_uploaded_photo(request(), self.listing, form, "directory/listings/1")
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.image_key, "directory/listings/1/old.jpg")

    def test_remove_photo_clears_the_key_and_deletes_the_file(self):
        self.listing.image_key = "directory/listings/1/old.jpg"
        self.listing.save()
        form = bound(remove_photo="on")
        form.is_valid()
        with patch.object(storage, "delete_object") as delete:
            save_uploaded_photo(request(), self.listing, form, "directory/listings/1")
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.image_key, "")
        delete.assert_called_once()

    def test_no_choice_changes_nothing(self):
        form = bound()
        form.is_valid()
        with patch.object(storage, "put_object") as put:
            save_uploaded_photo(request(), self.listing, form, "directory/listings/1")
        put.assert_not_called()
