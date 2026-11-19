import json

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from unittest.mock import patch

from app.auth import issue_token_pair

from .models import Listing, Review

User = get_user_model()


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {issue_token_pair(user)['access_token']}"}


class DirectoryTests(TestCase):
    def setUp(self):
        cache.clear()  # throttle counters live in the cache and must not leak between tests
        self.u = User.objects.create_user("u", "u@example.com", "pw-12345", first_name="Uzo")
        self.o = User.objects.create_user("o", "o@example.com", "pw-12345", first_name="Owner")
        self.a, self.oa = bearer(self.u), bearer(self.o)
        mk = lambda **kw: Listing.objects.create(status="approved", phone="+2348000000000", **kw)
        self.hosp = mk(name="St Nicholas Hospital", category="hospitals", address="Lagos Island", latitude=6.45,
                       longitude=3.39, owner=self.o, services=["Emergency"])
        self.far = mk(name="Far Clinic", category="hospitals", address="Kano", latitude=12.0, longitude=8.5)
        self.sponsored = mk(name="Zed Pharmacy", category="hospitals", address="Ikeja", tier="sponsored")
        self.school = mk(name="Kapita College", category="schools", address="Lekki")
        Listing.objects.create(name="Pending Shop", category="businesses", address="x", phone="1234567")

    def call(self, method, path, data=None, auth=None):
        kwargs = {"content_type": "application/json", **(auth if auth is not None else self.a)}
        if data is not None:
            kwargs["data"] = json.dumps(data)
        return getattr(self.client, method)(path, **kwargs)

    def test_only_approved_listings_are_public_and_filters_work(self):
        names = {l["name"] for l in self.client.get("/api/directory/listings").json()}
        self.assertNotIn("Pending Shop", names)
        self.assertEqual(len(names), 4)
        self.assertEqual(len(self.client.get("/api/directory/listings?category=Schools").json()), 1)  # UI sends capitalised
        self.assertEqual(self.client.get("/api/directory/listings?q=ikeja").json()[0]["name"], "Zed Pharmacy")
        self.assertEqual(self.client.get(f"/api/directory/listings/{Listing.objects.get(name='Pending Shop').id}").status_code, 404)

    def test_sponsored_first_then_nearest(self):
        res = self.client.get("/api/directory/listings?category=hospitals&lat=6.46&lng=3.40").json()
        self.assertEqual([l["name"] for l in res], ["Zed Pharmacy", "St Nicholas Hospital", "Far Clinic"])
        self.assertLess(res[1]["distance_km"], 5)
        self.assertGreater(res[2]["distance_km"], 100)
        self.assertIsNone(res[0]["distance_km"])  # no coordinates stored

    def test_search_parses_intent(self):
        res = self.client.get("/api/directory/search?q=find a hospital in ikeja open now").json()
        self.assertEqual(res["intent"]["category"], "hospitals")
        self.assertEqual(res["intent"]["keywords"], ["ikeja"])
        self.assertEqual([l["name"] for l in res["results"]], ["Zed Pharmacy"])
        res = self.client.get("/api/directory/search?q=school").json()
        self.assertEqual([l["name"] for l in res["results"]], ["Kapita College"])

    def test_reviews_upsert_and_aggregate(self):
        url = f"/api/directory/listings/{self.hosp.id}/reviews"
        self.assertEqual(self.call("post", url, {"rating": 6}).status_code, 422)
        self.assertEqual(self.call("post", url, {"rating": 5}, auth={}).status_code, 401)
        self.assertEqual(self.call("post", url, {"rating": 4, "comment": "ok"}).status_code, 201)
        self.assertEqual(self.call("post", url, {"rating": 2, "comment": "changed"}).status_code, 201)  # edit, not duplicate
        self.assertEqual(Review.objects.count(), 1)
        other = User.objects.create_user("p", "p@example.com", "pw-12345")
        self.call("post", url, {"rating": 4}, auth=bearer(other))
        detail = self.client.get(f"/api/directory/listings/{self.hosp.id}").json()
        self.assertEqual(detail["rating"], 3.0)
        self.assertEqual(detail["review_count"], 2)
        self.assertEqual(len(detail["reviews"]), 2)
        self.assertEqual(self.call("post", url, {"rating": 5}, auth=self.oa).status_code, 422)  # own listing

    @override_settings(DIRECTORY_AUTO_APPROVE=False)
    def test_new_listing_is_pending_until_staff_approve(self):
        body = {"name": "Kapita Clinic", "category": "hospitals", "phone": "+2348011112222", "address": "1 Street",
                "services": ["X-ray", " "]}
        res = self.call("post", "/api/directory/listings", body)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["status"], "pending")
        self.assertEqual(res.json()["services"], ["X-ray"])
        self.assertNotIn("Kapita Clinic", {l["name"] for l in self.client.get("/api/directory/listings").json()})
        self.assertEqual([l["name"] for l in self.call("get", "/api/directory/mine").json()], ["Kapita Clinic"])
        self.assertEqual(self.call("post", "/api/directory/listings", {**body, "category": "bogus"}).status_code, 422)
        self.assertEqual(self.call("post", "/api/directory/listings", {**body, "tier": "gold"}).status_code, 422)
        Listing.objects.filter(name="Kapita Clinic").update(status="approved")
        self.assertIn("Kapita Clinic", {l["name"] for l in self.client.get("/api/directory/listings").json()})

    @override_settings(DIRECTORY_AUTO_APPROVE=True)
    def test_auto_approve_in_dev(self):
        res = self.call("post", "/api/directory/listings", {"name": "Quick Shop", "category": "businesses",
                                                              "phone": "+2348011112222", "address": "1 Street"})
        self.assertEqual(res.json()["status"], "approved")

    def test_bookmarks_toggle(self):
        url = f"/api/directory/listings/{self.school.id}/bookmark"
        self.assertTrue(self.call("post", url).json()["bookmarked"])
        self.assertEqual([l["name"] for l in self.call("get", "/api/directory/bookmarks").json()], ["Kapita College"])
        self.assertFalse(self.call("post", url).json()["bookmarked"])
        self.assertEqual(self.call("get", "/api/directory/bookmarks").json(), [])
        self.assertEqual(self.call("post", "/api/directory/listings/99999/bookmark").status_code, 404)

    def test_reports_validate_issue_type(self):
        ok = self.call("post", "/api/directory/reports", {"listing_id": self.hosp.id, "issue_type": "Business Permanently Closed"})
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(self.call("post", "/api/directory/reports", {"listing_id": self.hosp.id, "issue_type": "Spam"}).status_code, 422)
        self.assertEqual(self.call("post", "/api/directory/reports", {"listing_id": 99999, "issue_type": "Business Permanently Closed"}).status_code, 404)


class ListingImageTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("photo-owner", "photo@example.com", "pw-12345")
        self.other = User.objects.create_user("photo-other", "other@example.com", "pw-12345")
        self.owner_auth = bearer(self.owner)
        self.other_auth = bearer(self.other)
        self.listing = Listing.objects.create(
            name="Photo Listing", category="restaurants", address="Abuja", phone="",
            owner=self.owner, status=Listing.Status.APPROVED,
        )
        self.imported = Listing.objects.create(
            name="Imported Place", category="businesses", address="Lagos", phone="",
            source=Listing.Source.OSM, source_id="node/123", status=Listing.Status.APPROVED,
        )

    def test_owner_requests_signed_upload_and_saves_only_the_s3_key(self):
        key = f"directory/listings/{self.listing.id}/photo"
        upload_url_path = f"/api/directory/listings/{self.listing.id}/image/upload-url"
        upload_request = {"filename": "restaurant.png", "content_type": "image/png", "size": 512}
        with patch("directory.api.storage.generate_presigned_upload", return_value={
            "url": "https://bucket.example/upload", "fields": {"key": key, "Content-Type": "image/png"},
        }) as presign:
            response = self.client.post(
                upload_url_path,
                data=json.dumps(upload_request),
                content_type="application/json",
                **self.owner_auth,
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), {
            "key": key,
            "upload_url": "https://bucket.example/upload",
            "fields": {"key": key, "Content-Type": "image/png"},
        })
        presign.assert_called_once_with(key, "image/png")

        with (
            patch("directory.api.storage.inspect_uploaded_image", return_value={
                "content_type": "image/png", "size": 512,
            }),
            patch("directory.models.generate_presigned_url", return_value="https://bucket.example/photo?signature=..."),
        ):
            attached = self.client.post(
                f"/api/directory/listings/{self.listing.id}/image",
                data=json.dumps({"key": key}),
                content_type="application/json",
                **self.owner_auth,
            )
            detail = self.client.get(f"/api/directory/listings/{self.listing.id}", **self.owner_auth).json()
        self.assertEqual(attached.status_code, 200, attached.content)
        self.assertEqual(attached.json()["image_key"], key)
        self.assertEqual(detail["image_url"], "https://bucket.example/photo?signature=...")
        self.assertTrue(detail["can_upload_image"])
        other_detail = self.client.get(f"/api/directory/listings/{self.imported.id}", **self.other_auth).json()
        self.assertFalse(other_detail["can_upload_image"])

    def test_only_owner_or_staff_can_request_upload_and_keys_are_validated(self):
        upload_url_path = f"/api/directory/listings/{self.listing.id}/image/upload-url"
        upload_request = {"filename": "restaurant.png", "content_type": "image/png", "size": 512}
        denied = self.client.post(
            upload_url_path,
            data=json.dumps(upload_request),
            content_type="application/json",
            **self.other_auth,
        )
        self.assertEqual(denied.status_code, 403)

        invalid = self.client.post(
            upload_url_path,
            data=json.dumps({**upload_request, "filename": "restaurant.svg", "content_type": "image/svg+xml"}),
            content_type="application/json",
            **self.owner_auth,
        )
        self.assertEqual(invalid.status_code, 422)
        oversize = self.client.post(
            upload_url_path,
            data=json.dumps({**upload_request, "size": 8 * 1024 * 1024 + 1}),
            content_type="application/json",
            **self.owner_auth,
        )
        self.assertEqual(oversize.status_code, 422)

        wrong_key = self.client.post(
            f"/api/directory/listings/{self.listing.id}/image",
            data=json.dumps({"key": "directory/listings/someone-elses/photo"}),
            content_type="application/json",
            **self.owner_auth,
        )
        self.assertEqual(wrong_key.status_code, 422)
        with patch("directory.api.storage.inspect_uploaded_image", return_value=None):
            missing_object = self.client.post(
                f"/api/directory/listings/{self.listing.id}/image",
                data=json.dumps({"key": f"directory/listings/{self.listing.id}/photo"}),
                content_type="application/json",
                **self.owner_auth,
            )
        self.assertEqual(missing_object.status_code, 422)

        key = f"directory/listings/{self.imported.id}/photo"
        with (
            patch("directory.api.storage.inspect_uploaded_image", return_value={
                "content_type": "image/png", "size": 512,
            }),
            patch("directory.models.generate_presigned_url", return_value="https://bucket.example/photo"),
        ):
            denied_key = self.client.post(
                f"/api/directory/listings/{self.imported.id}/image",
                data=json.dumps({"key": key}),
                content_type="application/json",
                **self.other_auth,
            )
        self.assertEqual(denied_key.status_code, 403)

        staff = User.objects.create_superuser("photo-admin", "admin@example.com", "pw-12345")
        with patch("directory.api.storage.inspect_uploaded_image", return_value={
            "content_type": "image/png", "size": 512,
        }), patch("directory.models.generate_presigned_url", return_value="https://bucket.example/photo"):
            staff_response = self.client.post(
                f"/api/directory/listings/{self.imported.id}/image",
                data=json.dumps({"key": key}),
                content_type="application/json",
                **bearer(staff),
            )
        self.assertEqual(staff_response.status_code, 200, staff_response.content)
