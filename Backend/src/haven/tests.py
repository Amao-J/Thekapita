from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings

from app.auth import issue_token_pair

from .models import Property

User = get_user_model()


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {issue_token_pair(user)['access_token']}"}


RENT = {"title": "Modern 3-Bedroom Serviced Apartment", "intent": "rent", "category": "apartment", "price": "4500000",
        "address": "5 Estate Rd", "city": "Ikeja GRA, Lagos", "bedrooms": 3, "bathrooms": 3, "title_doc": "gov"}


@override_settings(HAVEN_AUTO_APPROVE=False)
class HavenApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user("o", "o@example.com", "pw-12345")
        self.other = User.objects.create_user("x", "x@example.com", "pw-12345")
        self.o, self.x = bearer(self.owner), bearer(self.other)

    def post(self, payload, headers=None):
        return self.client.post("/api/haven/properties", payload, content_type="application/json", **(headers or self.o))

    def live(self, **kw):
        base = dict(owner=self.owner, title="Live flat", intent="rent", price=1000000, address="1 Rd", city="Yaba, Lagos",
                    status=Property.Status.APPROVED)
        base.update(kw)
        return Property.objects.create(**base)

    def test_create_requires_auth(self):
        r = self.client.post("/api/haven/properties", RENT, content_type="application/json")
        self.assertEqual(r.status_code, 401)

    def test_create_is_pending_and_hidden_until_approved(self):
        r = self.post(RENT)
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual((body["status"], body["price_period"], body["is_mine"]), ("pending", "year", True))
        self.assertEqual(self.client.get("/api/haven/properties").json(), [])
        self.assertEqual(len(self.client.get("/api/haven/mine", **self.o).json()), 1)
        self.assertEqual(self.client.get(f"/api/haven/properties/{body['id']}").status_code, 404)
        Property.objects.update(status="approved")
        self.assertEqual(len(self.client.get("/api/haven/properties").json()), 1)

    @override_settings(HAVEN_AUTO_APPROVE=True)
    def test_auto_approve_setting(self):
        self.assertEqual(self.post(RENT).json()["status"], "approved")

    def test_validation(self):
        self.assertEqual(self.post({**RENT, "price": "-5"}).status_code, 422)
        self.assertEqual(self.post({**RENT, "intent": "swap"}).status_code, 422)
        self.assertEqual(self.post({**RENT, "image_url": "javascript:alert(1)"}).status_code, 422)
        self.assertEqual(Property.objects.count(), 0)

    def test_filters(self):
        self.live(title="Cheap", price=1000000)
        self.live(title="Big sale", intent="buy", price=90000000, bedrooms=4, city="Lekki, Lagos")
        pending = self.live(title="Hidden", status="pending")
        titles = lambda qs: sorted(p["title"] for p in self.client.get("/api/haven/properties" + qs).json())
        self.assertEqual(titles(""), ["Big sale", "Cheap"])
        self.assertEqual(titles("?intent=rent"), ["Cheap"])
        self.assertEqual(titles("?max_price=2000000"), ["Cheap"])
        self.assertEqual(titles("?q=lekki"), ["Big sale"])
        self.assertEqual(titles("?bedrooms=3"), ["Big sale"])
        self.assertNotIn(pending.title, titles(""))

    def test_only_owner_can_edit_or_archive(self):
        p = self.live(title_verified=True)
        url = f"/api/haven/properties/{p.id}"
        self.assertEqual(self.client.patch(url, {"price": "1"}, content_type="application/json", **self.x).status_code, 404)
        r = self.client.patch(url, {"price": "2500000", "title_doc": "deed"}, content_type="application/json", **self.o)
        self.assertEqual(r.status_code, 200, r.content)
        p.refresh_from_db()
        self.assertEqual((int(p.price), p.title_verified), (2500000, False))  # new document => needs re-audit
        self.assertEqual(self.client.delete(url, **self.x).status_code, 404)
        self.assertEqual(self.client.delete(url, **self.o).status_code, 204)
        self.assertEqual(self.client.get("/api/haven/properties").json(), [])
        self.assertEqual(self.client.get("/api/haven/mine", **self.o).json(), [])

    def test_bookmarks(self):
        p = self.live()
        url = f"/api/haven/properties/{p.id}/bookmark"
        self.assertEqual(self.client.post(url).status_code, 401)
        self.assertEqual(self.client.post(url, **self.x).json(), {"bookmarked": True})
        self.client.post(url, **self.x)  # idempotent
        self.assertEqual(len(self.client.get("/api/haven/bookmarks", **self.x).json()), 1)
        self.assertTrue(self.client.get("/api/haven/properties", **self.x).json()[0]["bookmarked"])
        self.assertFalse(self.client.get("/api/haven/properties").json()[0]["bookmarked"])
        self.client.delete(url, **self.x)
        self.assertEqual(self.client.get("/api/haven/bookmarks", **self.x).json(), [])

    def test_view_counter_skips_owner(self):
        p = self.live()
        self.client.get(f"/api/haven/properties/{p.id}")
        self.client.get(f"/api/haven/properties/{p.id}", **self.o)
        p.refresh_from_db()
        self.assertEqual(p.views, 1)
