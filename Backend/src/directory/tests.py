import json

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings

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
