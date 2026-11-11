import datetime as dt
import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from app import ledger
from app.auth import issue_token_pair
from app.models import Wallet

from .models import FoodOrder, MenuItem, Restaurant

User = get_user_model()


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {issue_token_pair(user)['access_token']}"}


@override_settings(FOOD_AUTO_APPROVE=True)
class FoodTests(TestCase):
    def setUp(self):
        cache.clear()  # throttle counters live in the cache and must not leak between tests
        self.vendor = User.objects.create_user("v", "v@example.com", "pw-12345", first_name="Vee")
        self.cust = User.objects.create_user("c", "c@example.com", "pw-12345", first_name="Chi")
        self.v, self.c = bearer(self.vendor), bearer(self.cust)
        Wallet.objects.create(user=self.cust)
        ledger.credit(self.cust, Decimal("20000.00"), "T-FUND")
        self.r = Restaurant.objects.create(
            owner=self.vendor, name="Buka One", slug="buka-one", category="buka", tags=["swallow"],
            address="1 Road", phone="08000000000", delivery_fee=500)
        self.amala = MenuItem.objects.create(restaurant=self.r, name="Amala", price=2500)
        self.rice = MenuItem.objects.create(restaurant=self.r, name="Rice", price=1000, is_available=False)
        other_owner = User.objects.create_user("o", "o@example.com", "pw-12345")
        self.other = Restaurant.objects.create(owner=other_owner, name="Fine One", slug="fine-one", category="fine",
                                               address="2 Road", phone="08000000001")
        self.foreign_item = MenuItem.objects.create(restaurant=self.other, name="Steak", price=9000)

    def req(self, method, path, data=None, auth=None, **extra):
        fn = getattr(self.client, method)
        kwargs = {"content_type": "application/json", **(auth if auth is not None else self.c), **extra}
        if data is not None:
            kwargs["data"] = json.dumps(data)
        return fn(path, **kwargs)

    def order(self, key="k1", qty=2, restaurant="buka-one", item=None):
        return self.req("post", "/api/food/orders", {
            "restaurant": restaurant, "items": [{"id": (item or self.amala).id, "qty": qty}], "address": "9 Home St",
        }, HTTP_IDEMPOTENCY_KEY=key)

    # -- catalogue
    def test_catalogue_filters_and_hides_unavailable_dishes(self):
        res = self.client.get("/api/food/restaurants").json()
        self.assertEqual({r["slug"] for r in res}, {"buka-one", "fine-one"})
        self.assertEqual([r["slug"] for r in self.client.get("/api/food/restaurants?category=fine").json()], ["fine-one"])
        self.assertEqual([r["slug"] for r in self.client.get("/api/food/restaurants?tag=swallow").json()], ["buka-one"])
        self.assertEqual([r["slug"] for r in self.client.get("/api/food/restaurants?q=steak").json()], ["fine-one"])
        detail = self.client.get("/api/food/restaurants/buka-one").json()
        self.assertEqual([m["name"] for m in detail["menu"]], ["Amala"])
        self.r.is_active = False
        self.r.save()
        self.assertEqual(self.client.get("/api/food/restaurants/buka-one").status_code, 404)

    # -- ordering + escrow
    def test_order_holds_total_in_escrow_and_is_idempotent(self):
        res = self.order()
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["order"]["total"], 5500.0)  # 2 x 2500 + 500 delivery
        self.assertEqual(body["order"]["status"], "incoming")
        self.assertEqual(Wallet.objects.get(user=self.cust).balance, Decimal("14500.00"))
        replay = self.order()
        self.assertEqual(replay.json()["order"]["reference"], body["order"]["reference"])
        self.assertEqual(FoodOrder.objects.count(), 1)
        self.assertEqual(Wallet.objects.get(user=self.cust).balance, Decimal("14500.00"))
        self.assertEqual(self.order(key="k1", qty=3).status_code, 409)  # same key, different body

    def test_order_rules(self):
        self.assertEqual(self.req("post", "/api/food/orders", {"restaurant": "buka-one", "items": [{"id": 1}]}, auth={}).status_code, 401)
        self.assertEqual(self.req("post", "/api/food/orders", {"restaurant": "buka-one", "items": [{"id": self.amala.id}]}).status_code, 400)  # no key
        self.assertEqual(self.order(key="a", item=self.rice).status_code, 422)          # unavailable
        self.assertEqual(self.order(key="b", item=self.foreign_item).status_code, 422)  # other restaurant's dish
        self.assertEqual(self.order(key="c", qty=100).status_code, 422)                 # qty validation
        self.r.is_open = False
        self.r.save()
        self.assertEqual(self.order(key="d").status_code, 422)                          # closed
        self.r.is_open = True
        self.r.save()
        broke = self.order(key="e", qty=50)  # 125,500 > balance
        self.assertEqual(broke.status_code, 422)
        self.assertEqual(FoodOrder.objects.count(), 0)  # rolled back, nothing half-created
        own = self.req("post", "/api/food/orders", {"restaurant": "buka-one", "items": [{"id": self.amala.id}]},
                       auth=self.v, HTTP_IDEMPOTENCY_KEY="own")
        self.assertEqual(own.status_code, 422)

    def test_vendor_flow_confirm_pays_the_vendor_once(self):
        ref = self.order().json()["order"]["reference"]
        self.assertEqual(self.req("get", "/api/food/vendor/me", auth=self.c).status_code, 403)
        queue = self.req("get", "/api/food/vendor/orders", auth=self.v).json()
        self.assertEqual([o["reference"] for o in queue], [ref])
        self.assertEqual(queue[0]["customer_name"], "Chi")

        step = lambda s: self.req("post", f"/api/food/vendor/orders/{ref}/status", {"status": s}, auth=self.v)
        self.assertEqual(step("dispatch").status_code, 422)  # can't skip preparing
        self.assertEqual(step("nonsense").status_code, 422)
        self.assertEqual(self.req("post", f"/api/food/orders/{ref}/confirm").status_code, 422)  # nothing to confirm yet
        self.assertEqual(step("preparing").json()["status"], "preparing")
        self.assertEqual(self.req("post", f"/api/food/orders/{ref}/cancel").status_code, 422)   # too late to cancel
        self.assertEqual(step("dispatch").json()["status"], "dispatch")
        self.assertEqual(step("handed_over").json()["status"], "handed_over")

        done = self.req("post", f"/api/food/orders/{ref}/confirm")
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()["status"], "completed")
        self.assertEqual(Wallet.objects.get(user=self.vendor).balance, Decimal("5500.00"))
        self.assertEqual(self.req("post", f"/api/food/orders/{ref}/confirm").status_code, 422)  # no double pay
        self.assertEqual(Wallet.objects.get(user=self.vendor).balance, Decimal("5500.00"))
        self.assertEqual(self.req("get", "/api/food/vendor/orders", auth=self.v).json(), [])  # completed leaves the board

    def test_vendor_summary_reflects_real_orders(self):
        a = self.order(key="a").json()["order"]["reference"]   # 5500
        b = self.order(key="b", qty=1).json()["order"]["reference"]  # 3000
        self.req("post", f"/api/food/orders/{b}/cancel")
        s = self.req("get", "/api/food/vendor/summary", auth=self.v).json()
        self.assertEqual((s["sales_today"], s["active_orders"], s["completed_today"], s["balance"]), (5500.0, 1, 0, 0.0))
        for step in ("preparing", "dispatch"):
            self.req("post", f"/api/food/vendor/orders/{a}/status", {"status": step}, auth=self.v)
        self.req("post", f"/api/food/orders/{a}/confirm")
        s = self.req("get", "/api/food/vendor/summary", auth=self.v).json()
        self.assertEqual((s["sales_today"], s["active_orders"], s["completed_today"], s["balance"]), (5500.0, 0, 1, 5500.0))
        self.assertEqual(self.req("get", "/api/food/vendor/summary", auth=self.c).status_code, 403)

    def test_decline_and_cancel_refund_the_customer(self):
        a = self.order(key="a").json()["order"]["reference"]
        b = self.order(key="b").json()["order"]["reference"]
        self.assertEqual(Wallet.objects.get(user=self.cust).balance, Decimal("9000.00"))
        self.assertEqual(self.req("post", f"/api/food/vendor/orders/{a}/status", {"status": "declined"}, auth=self.v).json()["status"], "declined")
        self.assertEqual(self.req("post", f"/api/food/orders/{b}/cancel").json()["status"], "cancelled")
        self.assertEqual(Wallet.objects.get(user=self.cust).balance, Decimal("20000.00"))
        # another customer can't see or touch it
        stranger = User.objects.create_user("s", "s@example.com", "pw-12345")
        self.assertEqual(self.req("post", f"/api/food/orders/{a}/cancel", auth=bearer(stranger)).status_code, 404)
        # and another vendor can't move it
        self.assertEqual(self.req("post", f"/api/food/vendor/orders/{a}/status", {"status": "preparing"},
                                  auth=bearer(self.other.owner)).status_code, 404)

    def test_vendor_register_menu_and_store(self):
        newbie = User.objects.create_user("n", "n@example.com", "pw-12345", first_name="Nia")
        n = bearer(newbie)
        bad = self.req("post", "/api/food/vendor/register", {"name": "X Kitchen", "category": "pizza", "address": "1 St", "phone": "08000000000"}, auth=n)
        self.assertEqual(bad.status_code, 422)
        ok = self.req("post", "/api/food/vendor/register", {"name": "Nia's Kitchen", "category": "bakery", "address": "1 Street", "phone": "08000000000"}, auth=n)
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(ok.json()["slug"], "nias-kitchen")
        self.assertEqual(self.req("post", "/api/food/vendor/register", {"name": "Again", "category": "bakery", "address": "1 Street", "phone": "08000000000"}, auth=n).status_code, 409)
        evil = self.req("post", "/api/food/vendor/menu", {"name": "X", "price": 100, "image_url": "javascript:alert(1)"}, auth=n)
        self.assertEqual(evil.status_code, 422)
        dish = self.req("post", "/api/food/vendor/menu", {"name": "Puff puff", "price": 1500, "category": "Snacks"}, auth=n)
        self.assertEqual(dish.status_code, 201, dish.content)
        self.assertEqual(self.req("post", "/api/food/vendor/menu", {"name": "Free", "price": 0}, auth=n).status_code, 422)
        upd = self.req("patch", f"/api/food/vendor/menu/{dish.json()['id']}", {"is_available": False}, auth=n)
        self.assertFalse(upd.json()["is_available"])
        # can't edit someone else's dish
        self.assertEqual(self.req("patch", f"/api/food/vendor/menu/{self.amala.id}", {"price": 1}, auth=n).status_code, 404)
        store = self.req("patch", "/api/food/vendor/store", {"is_open": False, "hours": "8am-6pm"}, auth=n)
        self.assertFalse(store.json()["is_open"])
        self.assertEqual(self.client.get("/api/food/restaurants/nias-kitchen").json()["is_open"], False)

    @override_settings(FOOD_AUTO_APPROVE=False)
    def test_unapproved_store_is_hidden_until_staff_approve(self):
        newbie = User.objects.create_user("n2", "n2@example.com", "pw-12345")
        res = self.req("post", "/api/food/vendor/register", {"name": "Hidden Spot", "category": "buka", "address": "1 Street", "phone": "08000000000"}, auth=bearer(newbie))
        self.assertFalse(res.json()["is_active"])
        self.assertEqual(self.client.get("/api/food/restaurants/hidden-spot").status_code, 404)

    # -- reservations
    def test_reservations(self):
        future = (timezone.localdate() + dt.timedelta(days=3)).isoformat()
        past = (timezone.localdate() - dt.timedelta(days=1)).isoformat()
        base = {"restaurant": "fine-one", "time": "19:00", "guests": 2}
        self.assertEqual(self.req("post", "/api/food/reservations", {**base, "date": past}).status_code, 422)
        self.assertEqual(self.req("post", "/api/food/reservations", {**base, "date": future, "guests": 50}).status_code, 422)
        ok = self.req("post", "/api/food/reservations", {**base, "date": future})
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(ok.json()["restaurant"], "Fine One")
        self.assertEqual(len(self.req("get", "/api/food/reservations").json()), 1)
        done = self.req("post", f"/api/food/reservations/{ok.json()['reference']}/cancel")
        self.assertEqual(done.json()["status"], "cancelled")
        self.assertEqual(self.req("post", f"/api/food/reservations/{ok.json()['reference']}/cancel", auth=self.v).status_code, 404)
