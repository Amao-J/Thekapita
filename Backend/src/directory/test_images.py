import base64
import io
import json
import re
from unittest.mock import patch

from botocore.response import StreamingBody
from botocore.stub import Stubber
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from app.auth import issue_token_pair

from . import storage
from .models import Listing

User = get_user_model()
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00"
PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 "
S3 = dict(AWS_STORAGE_BUCKET_NAME="test-bucket", AWS_ACCESS_KEY_ID="AKIATEST", AWS_SECRET_ACCESS_KEY="secret",
          AWS_S3_ENDPOINT_URL="https://storage.example.com", AWS_S3_REGION_NAME="auto", AWS_S3_ADDRESSING_STYLE="path")


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {issue_token_pair(user)['access_token']}"}


class DetectImageTypeTests(TestCase):
    def test_reads_the_real_type_from_the_first_bytes(self):
        self.assertEqual(storage.detect_image_type(JPEG), "image/jpeg")
        self.assertEqual(storage.detect_image_type(PNG), "image/png")
        self.assertEqual(storage.detect_image_type(WEBP), "image/webp")

    def test_rejects_everything_else_even_if_it_was_called_an_image(self):
        for head in (b"<html><script>alert(1)</script>", b"<svg xmlns=", b"GIF89a", b"%PDF-1.7", b"", b"RIFF\x00\x00\x00\x00WAVE"):
            self.assertIsNone(storage.detect_image_type(head), head)


@override_settings(**S3)
class RealS3ClientTests(TestCase):
    """The boto3 wiring, with real signing but no network."""

    def test_upload_policy_pins_type_and_size_and_key(self):
        post = storage.generate_presigned_upload("directory/listings/1/abc.png", "image/png")
        self.assertIn("test-bucket", post["url"])
        self.assertEqual(post["fields"]["key"], "directory/listings/1/abc.png")
        self.assertEqual(post["fields"]["Content-Type"], "image/png")
        policy = json.loads(base64.b64decode(post["fields"]["policy"]))
        self.assertIn(["content-length-range", 1, storage.MAX_IMAGE_BYTES], policy["conditions"])
        self.assertIn({"Content-Type": "image/png"}, policy["conditions"])
        self.assertIn({"key": "directory/listings/1/abc.png"}, policy["conditions"])

    def test_signed_view_link_is_for_that_key_and_expires(self):
        url = storage.generate_presigned_url("directory/listings/1/abc.png")
        self.assertIn("directory/listings/1/abc.png", url)
        self.assertRegex(url, r"X-Amz-Signature=[0-9a-f]{64}")
        self.assertRegex(url, r"X-Amz-Expires=\d+")

    def _stubbed(self):
        client = storage._configured_client()
        return client, Stubber(client)

    def test_sniff_reads_only_the_first_16_bytes_and_returns_the_real_type(self):
        client, stub = self._stubbed()
        stub.add_response("get_object", {"Body": StreamingBody(io.BytesIO(PNG), len(PNG))},
                          {"Bucket": "test-bucket", "Key": "k.png", "Range": "bytes=0-15"})
        with stub:
            self.assertEqual(storage.sniff_uploaded_image("k.png"), "image/png")
        stub.assert_no_pending_responses()

    def test_sniff_maps_missing_to_none_and_other_failures_to_a_clear_error(self):
        client, stub = self._stubbed()
        stub.add_client_error("get_object", service_error_code="NoSuchKey", http_status_code=404)
        stub.add_client_error("get_object", service_error_code="InternalError", http_status_code=500)
        with stub:
            self.assertIsNone(storage.sniff_uploaded_image("missing.png"))
            with self.assertLogs("directory.storage", "ERROR"), self.assertRaises(storage.S3ImageStorageError):
                storage.sniff_uploaded_image("broken.png")

    def test_delete_never_raises(self):
        client, stub = self._stubbed()
        stub.add_client_error("delete_object", service_error_code="AccessDenied", http_status_code=403)
        stub.add_response("delete_object", {}, {"Bucket": "test-bucket", "Key": "gone.png"})
        with stub:
            with self.assertLogs("directory.storage", "WARNING"):
                storage.delete_object("a.png")  # a failure is swallowed, not raised
            storage.delete_object("gone.png")   # and a success sends the right request
        storage.delete_object("")               # nothing to delete: no call at all


class PhotoApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("po", "po@example.com", "pw-12345")
        self.other = User.objects.create_user("px", "px@example.com", "pw-12345")
        self.staff = User.objects.create_superuser("ps", "ps@example.com", "pw-12345")
        self.listing = Listing.objects.create(name="Photo Listing", category="restaurants", address="Abuja", phone="",
                                              owner=self.owner, status=Listing.Status.APPROVED)
        self.imported = Listing.objects.create(name="Imported", category="businesses", address="Lagos", phone="",
                                               source="osm", source_id="node/1", status=Listing.Status.APPROVED)
        self.prefix = f"directory/listings/{self.listing.id}"

    def post(self, path, data=None, auth=None):
        return self.client.post(path, data=json.dumps(data or {}), content_type="application/json", **(auth or bearer(self.owner)))

    def upload_url(self, listing=None, auth=None, **over):
        body = {"filename": "shop.png", "content_type": "image/png", "size": 512, **over}
        return self.post(f"/api/directory/listings/{(listing or self.listing).id}/image/upload-url", body, auth)

    def confirm(self, key, listing=None, auth=None):
        return self.post(f"/api/directory/listings/{(listing or self.listing).id}/image", {"key": key}, auth)

    def good_key(self, name="a" * 32, ext="png", prefix=None):
        return f"{prefix or self.prefix}/{name}.{ext}"

    def stored(self, content_type="image/png", size=512, real="image/png"):
        return (patch("directory.storage.inspect_uploaded_image", return_value={"content_type": content_type, "size": size}),
                patch("directory.storage.sniff_uploaded_image", return_value=real))

    # -- issuing
    def test_each_upload_gets_a_fresh_unguessable_key_under_the_listing(self):
        with patch("directory.storage.generate_presigned_upload", return_value={"url": "https://s3/up", "fields": {"k": "v"}}) as presign:
            a = self.upload_url().json()
            b = self.upload_url().json()
        self.assertRegex(a["key"], rf"^{re.escape(self.prefix)}/[0-9a-f]{{32}}\.png$")
        self.assertNotEqual(a["key"], b["key"])
        self.assertEqual((a["upload_url"], a["fields"], a["max_bytes"]), ("https://s3/up", {"k": "v"}, 8 * 1024 * 1024))
        presign.assert_any_call(a["key"], "image/png")

    def test_only_owner_or_staff_may_request_an_upload(self):
        with patch("directory.storage.generate_presigned_upload", return_value={"url": "u", "fields": {}}):
            self.assertEqual(self.upload_url(auth=bearer(self.other)).status_code, 403)
            self.assertEqual(self.upload_url(auth=bearer(self.staff)).status_code, 200)
            self.assertEqual(self.upload_url(listing=self.imported, auth=bearer(self.staff)).status_code, 200)  # unclaimed: staff only
            self.assertEqual(self.upload_url(listing=self.imported, auth=bearer(self.owner)).status_code, 403)
            self.assertEqual(self.client.post(f"/api/directory/listings/{self.listing.id}/image/upload-url").status_code, 401)

    def test_bad_types_extensions_and_sizes_are_refused_before_any_signing(self):
        with patch("directory.storage.generate_presigned_upload") as presign:
            for over in ({"filename": "x.svg", "content_type": "image/svg+xml"}, {"filename": "x.png", "content_type": "image/jpeg"},
                         {"filename": "noextension", "content_type": "image/png"}, {"filename": "x.gif", "content_type": "image/gif"},
                         {"size": 8 * 1024 * 1024 + 1}, {"size": 0}):
                self.assertEqual(self.upload_url(**over).status_code, 422, over)
        presign.assert_not_called()

    @override_settings(AWS_STORAGE_BUCKET_NAME=None, AWS_ACCESS_KEY_ID=None, AWS_SECRET_ACCESS_KEY=None)
    def test_upload_reports_503_when_storage_is_not_configured(self):
        self.assertEqual(self.upload_url().status_code, 503)

    # -- confirming
    def test_full_flow_saves_only_a_verified_key_and_the_owner_sees_the_photo(self):
        key = self.good_key()
        a, b = self.stored()
        with a, b, patch("directory.storage.generate_presigned_url", return_value="https://s3/signed"):
            done = self.confirm(key)
            detail = self.client.get(f"/api/directory/listings/{self.listing.id}", **bearer(self.owner)).json()
            public = self.client.get(f"/api/directory/listings/{self.listing.id}").json()
            stranger = self.client.get(f"/api/directory/listings/{self.listing.id}", **bearer(self.other)).json()
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json(), {"id": self.listing.id, "image_key": key, "image_url": "https://s3/signed"})
        self.assertEqual((detail["image_url"], detail["can_upload_image"]), ("https://s3/signed", True))
        self.assertEqual((public["image_url"], public["can_upload_image"]), ("https://s3/signed", False))
        self.assertFalse(stranger["can_upload_image"])

    def test_keys_not_issued_for_this_listing_are_refused(self):
        a, b = self.stored()
        other_prefix = f"directory/listings/{self.imported.id}"
        with a, b:
            for key in (self.good_key(prefix=other_prefix), self.good_key(name="photo"), f"{self.prefix}/../x/{'a'*32}.png",
                        self.good_key(ext="svg"), self.good_key(name="A" * 32), "", f"{self.prefix}/{'a'*32}.png/extra",
                        f"food/restaurants/1/{'a'*32}.png"):
                self.assertEqual(self.confirm(key).status_code, 422, key)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.image_key, "")

    def test_an_object_that_was_never_uploaded_is_refused(self):
        with patch("directory.storage.inspect_uploaded_image", return_value=None):
            self.assertEqual(self.confirm(self.good_key()).status_code, 422)

    def test_a_file_that_lies_about_its_type_is_refused_and_deleted(self):
        key = self.good_key()
        a, b = self.stored(content_type="image/png", real=None)   # bytes are HTML/script, header says PNG
        with a, b, patch("directory.storage.delete_object") as delete:
            self.assertEqual(self.confirm(key).status_code, 422)
        delete.assert_called_once_with(key)
        a, b = self.stored(content_type="image/png", real="image/jpeg")  # a real image, but not the declared type
        with a, b, patch("directory.storage.delete_object"):
            self.assertEqual(self.confirm(key).status_code, 422)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.image_key, "")

    def test_wrong_stored_type_or_size_is_refused_and_deleted(self):
        for kwargs in ({"content_type": "text/html"}, {"size": 8 * 1024 * 1024 + 1}, {"size": 0}):
            a, b = self.stored(**kwargs)
            with a, b, patch("directory.storage.delete_object") as delete:
                self.assertEqual(self.confirm(self.good_key()).status_code, 422, kwargs)
            delete.assert_called_once()

    def test_non_owner_cannot_confirm_and_storage_errors_become_503(self):
        a, b = self.stored()
        with a, b:
            self.assertEqual(self.confirm(self.good_key(), auth=bearer(self.other)).status_code, 403)
        with patch("directory.storage.inspect_uploaded_image", side_effect=storage.S3ImageStorageError("down")):
            self.assertEqual(self.confirm(self.good_key()).status_code, 503)

    def test_replacing_a_photo_deletes_the_old_object_but_never_the_new_one(self):
        first, second = self.good_key("1" * 32), self.good_key("2" * 32)
        a, b = self.stored()
        with a, b, patch("directory.storage.delete_object") as delete, patch("directory.storage.generate_presigned_url", return_value="u"):
            self.confirm(first)
            delete.assert_not_called()
            self.confirm(second)
            delete.assert_called_once_with(first)
            delete.reset_mock()
            self.confirm(second)            # confirming the same key again must not delete the live photo
            delete.assert_not_called()
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.image_key, second)

    def test_owner_can_remove_the_photo(self):
        self.listing.image_key = self.good_key()
        self.listing.save()
        url = f"/api/directory/listings/{self.listing.id}/image"
        with patch("directory.storage.delete_object") as delete:
            self.assertEqual(self.client.delete(url, **bearer(self.other)).status_code, 403)
            res = self.client.delete(url, **bearer(self.owner))
        self.assertEqual(res.json(), {"id": self.listing.id, "image_key": "", "image_url": None})
        delete.assert_called_once_with(self.good_key())
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.image_key, "")

    # -- resilience
    @override_settings(AWS_STORAGE_BUCKET_NAME=None, AWS_ACCESS_KEY_ID=None, AWS_SECRET_ACCESS_KEY=None)
    def test_a_listing_with_a_photo_never_breaks_the_lists_when_storage_is_unavailable(self):
        Listing.objects.filter(pk=self.listing.pk).update(image_key=self.good_key())
        for url in ("/api/directory/listings?category=restaurants", f"/api/directory/listings/{self.listing.id}",
                    "/api/directory/search?q=restaurant", "/api/food/restaurants", "/api/food/restaurants?source=directory"):
            res = self.client.get(url)
            self.assertEqual(res.status_code, 200, url)
        self.assertIsNone(self.client.get(f"/api/directory/listings/{self.listing.id}").json()["image_url"])

    def test_a_bad_or_expired_token_on_a_public_page_means_anonymous_not_an_error(self):
        for header in ("Bearer not-a-real-token", "Bearer ", "Basic abc", "Bearer a.b.c"):
            res = self.client.get(f"/api/directory/listings/{self.listing.id}", HTTP_AUTHORIZATION=header)
            self.assertEqual(res.status_code, 200, header)
            self.assertFalse(res.json()["can_upload_image"])

    def test_a_public_base_url_gives_stable_cacheable_links(self):
        key = self.good_key()
        Listing.objects.filter(pk=self.listing.pk).update(image_key=key)
        with override_settings(LISTING_IMAGE_PUBLIC_BASE_URL="https://cdn.example.com/"):
            one = self.client.get(f"/api/directory/listings/{self.listing.id}").json()["image_url"]
            two = self.client.get(f"/api/directory/listings/{self.listing.id}").json()["image_url"]
        self.assertEqual(one, f"https://cdn.example.com/{key}")
        self.assertEqual(one, two)
