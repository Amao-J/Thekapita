import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from app import routing
from app.auth import issue_token_pair
from directory.models import Listing

from .models import MenuItem, Restaurant

User = get_user_model()


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {issue_token_pair(user)['access_token']}"}


def listing(i, name=None, **kw):
    fields = dict(name=name or f"Eatery {i:04d}", category="restaurants", address="Wuse 2", city="Abuja", phone="",
                  status="approved", source="osm", source_id=f"node/{i}", latitude=9.0 + (i % 40) * 0.002,
                  longitude=7.4, services=["Nigerian"])
    fields.update(kw)
    return Listing(**fields)


class CatalogueTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        owner = User.objects.create_user("vo", "vo@example.com", "pw-12345")
        cls.near_vendor = Restaurant.objects.create(owner=owner, name="Near Buka", slug="near-buka", category="buka", tags=["swallow"],
                                                    address="1 Rd", phone="0800", latitude=9.0765, longitude=7.4951)
        cls.far_vendor = Restaurant.objects.create(owner=User.objects.create_user("v2", "v2@example.com", "pw-12345"), name="Aaa Far Grill",
                                                   slug="far-grill", category="grill", address="2 Rd", phone="0800", latitude=6.45, longitude=3.4)
        cls.no_pin = Restaurant.objects.create(owner=User.objects.create_user("v3", "v3@example.com", "pw-12345"), name="Unpinned Fine",
                                               slug="unpinned", category="fine", address="3 Rd", phone="0800")
        MenuItem.objects.create(restaurant=cls.near_vendor, name="Pounded Yam", price=2500)
        Listing.objects.bulk_create([listing(i) for i in range(1, 251)] + [
            listing(900, "Mama Buka Spot", subtype="buka"), listing(901, "Crust Bakery", subtype="bakery"),
            listing(902, "Suya Corner", subtype="grill", latitude=9.0766, longitude=7.4952),
            Listing(name="Not Food", category="businesses", address="x", phone="", status="approved"),
            Listing(name="Pending Diner", category="restaurants", address="x", phone="", status="pending"),
        ])

    def get(self, qs=""):
        res = self.client.get(f"/api/food/restaurants{qs}")
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def test_source_modes_split_orderable_from_directory_only(self):
        food = self.get("?source=food&limit=100")
        self.assertEqual({r["slug"] for r in food}, {"near-buka", "far-grill", "unpinned"})
        self.assertTrue(all(r["is_orderable"] and r["source"] == "food" for r in food))
        directory = self.get("?source=directory&limit=100")
        self.assertEqual(len(directory), 100)
        self.assertTrue(all(not r["is_orderable"] and r["slug"].startswith("directory-") and r["id"] < 0 for r in directory))
        self.assertEqual(self.client.get("/api/food/restaurants?source=nope").status_code, 422)

    def test_video_urls_are_exposed_for_food_and_directory_restaurants(self):
        Restaurant.objects.filter(pk=self.near_vendor.pk).update(video_file="food/restaurants/videos/store.mp4")
        Listing.objects.filter(name="Mama Buka Spot").update(video_file="directory/listings/videos/shop.webm")
        with patch("food.api.image_storage.stored_file_url", side_effect=lambda file, request: f"https://media/{file.name}" if file else None):
            vendors = self.get("?source=food")
            places = self.get("?source=directory&q=Mama%20Buka%20Spot")
        by_slug = {row["slug"]: row["video_url"] for row in vendors}
        self.assertEqual(by_slug["near-buka"], "https://media/food/restaurants/videos/store.mp4")
        self.assertEqual(places[0]["video_url"], "https://media/directory/listings/videos/shop.webm")

    def test_all_lists_orderable_first_then_paginates_straight_on_into_the_directory(self):
        pages = [self.get(f"?limit=100&offset={o}") for o in (0, 100, 200, 300)]
        ids = [r["slug"] for page in pages for r in page]
        self.assertEqual(ids[:3], ["far-grill", "near-buka", "unpinned"])         # vendors first (A-Z when no location)
        self.assertTrue(all(s.startswith("directory-") for s in ids[3:]))
        self.assertEqual(len(ids), 3 + 253)                                           # 250 + 3 typed rows; not-food/pending excluded
        self.assertEqual(len(ids), len(set(ids)))                                     # no gaps or repeats across pages
        self.assertEqual(len(self.get("?limit=2&offset=2")), 2)                       # straddles vendor -> directory boundary
        self.assertEqual(self.get("?limit=2&offset=2")[0]["slug"], "unpinned")

    def test_category_filters_work_across_both_kinds_in_the_database(self):
        self.assertEqual([r["slug"] for r in self.get("?category=buka&limit=100")][:1], ["near-buka"])
        self.assertIn("Mama Buka Spot", [r["name"] for r in self.get("?category=buka&limit=100")])
        self.assertEqual([r["name"] for r in self.get("?category=bakery")], ["Crust Bakery"])
        self.assertEqual(len(self.get("?category=external&source=directory&limit=100")), 100)
        self.assertNotIn("Mama Buka Spot", [r["name"] for r in self.get("?category=external&source=directory&limit=100")])
        self.assertEqual(self.get("?category=pizza"), [])                              # unknown category: nothing, not everything

    def test_search_and_tags(self):
        self.assertEqual([r["name"] for r in self.get("?q=crust")], ["Crust Bakery"])
        self.assertEqual([r["slug"] for r in self.get("?q=pounded")], ["near-buka"])    # matches a dish on the menu
        self.assertEqual(len(self.get("?q=wuse&source=directory&limit=100")), 100)      # address
        self.assertEqual([r["slug"] for r in self.get("?tag=swallow")], ["near-buka"])
        self.assertEqual(len(self.get("?tag=nigerian&source=directory&limit=100")), 100)  # service chips are searchable too
        self.assertEqual(self.get("?q=zzzznomatch"), [])

    def test_location_ranks_nearest_first_and_reports_distance(self):
        res = self.get("?lat=9.0765&lng=7.4951&limit=6")
        self.assertEqual(res[0]["slug"], "near-buka")                                   # pinned vendors by distance, unpinned last
        self.assertEqual(res[1]["slug"], "far-grill")
        self.assertEqual(res[2]["slug"], "unpinned")
        self.assertLess(res[0]["distance_km"], 0.1)
        self.assertIsNone(res[2]["distance_km"])
        near_dir = self.get("?source=directory&lat=9.0765&lng=7.4951&limit=3")
        self.assertEqual(near_dir[0]["name"], "Suya Corner")
        self.assertEqual(self.client.get("/api/food/restaurants?lat=9").status_code, 422)         # lat without lng
        self.assertEqual(self.client.get("/api/food/restaurants?lat=99&lng=7").status_code, 422)  # out of range

    def test_cost_does_not_grow_with_the_number_of_directory_rows(self):
        def queries(url):
            with CaptureQueriesContext(connection) as ctx:
                self.client.get(url)
            return len(ctx)
        small = queries("/api/food/restaurants?limit=60")
        Listing.objects.bulk_create([listing(i) for i in range(1000, 3000)])
        self.assertEqual(queries("/api/food/restaurants?limit=60"), small)
        self.assertEqual(len(self.get("?source=directory&limit=60&offset=2000")), 60)   # deep pages still work
        self.assertLessEqual(small, 8)

    def test_directory_rows_carry_credit_rating_and_are_never_orderable(self):
        row = self.get("?q=Mama Buka")[0]
        self.assertEqual((row["category"], row["is_orderable"], row["is_open"]), ("buka", False, False))
        self.assertEqual(row["attribution"], "\u00A9 OpenStreetMap contributors")
        self.assertIsNone(self.get("?source=food&limit=1")[0]["attribution"])
        self.assertEqual(self.client.get("/api/food/restaurants/directory-900").status_code, 404)  # no menu to open


class VendorPhotosAndLocationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("po", "po@example.com", "pw-12345")
        self.rival = User.objects.create_user("pr", "pr@example.com", "pw-12345")
        self.store = Restaurant.objects.create(owner=self.owner, name="Photo Kitchen", slug="photo-kitchen", address="1 Rd", phone="0800")
        Restaurant.objects.create(owner=self.rival, name="Rival", slug="rival", address="2 Rd", phone="0800")
        self.dish = MenuItem.objects.create(restaurant=self.store, name="Jollof", price=1500)
        self.o, self.r = bearer(self.owner), bearer(self.rival)

    def call(self, method, path, data=None, auth=None):
        kw = {"content_type": "application/json", **(auth or self.o)}
        if data is not None:
            kw["data"] = json.dumps(data)
        return getattr(self.client, method)(f"/api/food{path}", **kw)

    def ok_storage(self, real="image/png"):
        return (patch("directory.storage.inspect_uploaded_image", return_value={"content_type": "image/png", "size": 100}),
                patch("directory.storage.sniff_uploaded_image", return_value=real),
                patch("directory.storage.generate_presigned_url", side_effect=lambda k: f"https://signed/{k}"),
                patch("directory.storage.delete_object"))

    def test_store_photo_flow_and_it_shows_on_the_public_listing(self):
        with patch("directory.storage.generate_presigned_upload", return_value={"url": "https://s3", "fields": {}}):
            up = self.call("post", "/vendor/store/image/upload-url", {"filename": "front.jpg", "content_type": "image/jpeg", "size": 900}).json()
        self.assertRegex(up["key"], rf"^food/restaurants/{self.store.id}/[0-9a-f]{{32}}\.jpg$")
        key = f"food/restaurants/{self.store.id}/{'a' * 32}.png"
        a, b, c, d = self.ok_storage()
        with a, b, c, d:
            self.assertEqual(self.call("post", "/vendor/store/image", {"key": key}).json()["image_url"], f"https://signed/{key}")
            self.assertEqual(self.client.get("/api/food/restaurants/photo-kitchen").json()["image_url"], f"https://signed/{key}")
            # another store's key, or a dish key, is refused
            self.assertEqual(self.call("post", "/vendor/store/image", {"key": f"food/restaurants/999/{'a'*32}.png"}).status_code, 422)
            self.assertEqual(self.call("post", "/vendor/store/image", {"key": f"food/menu/{self.dish.id}/{'a'*32}.png"}).status_code, 422)
        with patch("directory.storage.delete_object") as delete:
            self.assertEqual(self.call("delete", "/vendor/store/image").json()["image_url"], None)
        delete.assert_called_once_with(key)

    def test_a_non_vendor_cannot_use_the_photo_endpoints(self):
        nobody = bearer(User.objects.create_user("nv", "nv@example.com", "pw-12345"))
        body = {"filename": "a.png", "content_type": "image/png", "size": 10}
        self.assertEqual(self.call("post", "/vendor/store/image/upload-url", body, nobody).status_code, 403)
        self.assertEqual(self.call("post", f"/vendor/menu/{self.dish.id}/image/upload-url", body, nobody).status_code, 403)

    def test_dish_photos_belong_to_the_dish_and_only_its_vendor(self):
        body = {"filename": "d.webp", "content_type": "image/webp", "size": 10}
        with patch("directory.storage.generate_presigned_upload", return_value={"url": "u", "fields": {}}):
            self.assertEqual(self.call("post", f"/vendor/menu/{self.dish.id}/image/upload-url", body, self.r).status_code, 404)  # rival's token
            self.assertRegex(self.call("post", f"/vendor/menu/{self.dish.id}/image/upload-url", body).json()["key"], rf"^food/menu/{self.dish.id}/")
        key = f"food/menu/{self.dish.id}/{'b' * 32}.png"
        a, b, c, d = self.ok_storage()
        with a, b, c, d as delete:
            self.assertEqual(self.call("post", f"/vendor/menu/{self.dish.id}/image", {"key": key}, self.r).status_code, 404)
            self.call("post", f"/vendor/menu/{self.dish.id}/image", {"key": key})
            menu = self.call("get", "/vendor/menu").json()
            self.assertEqual(menu[0]["image_url"], f"https://signed/{key}")
            self.assertEqual(self.client.get("/api/food/restaurants/photo-kitchen").json()["menu"][0]["image_url"], f"https://signed/{key}")
            self.call("delete", f"/vendor/menu/{self.dish.id}/image")
            delete.assert_called_with(key)

    def test_legacy_external_image_links_still_show_until_replaced(self):
        Restaurant.objects.filter(pk=self.store.pk).update(image_url="https://example.com/old.jpg")
        self.assertEqual(self.client.get("/api/food/restaurants/photo-kitchen").json()["image_url"], "https://example.com/old.jpg")

    def test_pinning_the_store_on_the_map(self):
        ok = self.call("patch", "/vendor/store", {"latitude": 9.0765, "longitude": 7.4951})
        self.assertEqual((ok.status_code, ok.json()["latitude"], ok.json()["longitude"]), (200, 9.0765, 7.4951))
        self.assertEqual(self.call("patch", "/vendor/store", {"latitude": 9.0}).status_code, 422)          # half a pin
        self.assertEqual(self.call("patch", "/vendor/store", {"latitude": 99, "longitude": 7}).status_code, 422)
        self.assertEqual(self.call("patch", "/vendor/store", {"name": "Renamed"}).json()["latitude"], 9.0765)  # other edits keep the pin


class DeliveryEstimateTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("c", "c@example.com", "pw-12345")
        owner = User.objects.create_user("o", "o@example.com", "pw-12345")
        self.store = Restaurant.objects.create(owner=owner, name="Pinned", slug="pinned", address="1 Rd", phone="0800",
                                               latitude=9.05, longitude=7.49)
        Restaurant.objects.create(owner=User.objects.create_user("o2", "o2@example.com", "pw-12345"), name="NoPin", slug="nopin",
                                  address="2 Rd", phone="0800")
        self.auth = bearer(self.user)

    def get(self, slug="pinned", q="lat=9.08&lng=7.50", auth=None):
        return self.client.get(f"/api/food/restaurants/{slug}/delivery-estimate?{q}", **(self.auth if auth is None else auth))

    def test_uses_the_road_route_when_available(self):
        route = routing.Route(4.2, 11.4, 9.0, 2.4, True, "tomtom", [])
        with patch("app.routing.get_route", return_value=route) as call:
            body = self.get().json()
        self.assertEqual(body, {"distance_km": 4.2, "minutes": 11, "source": "road", "traffic": True, "provider": "tomtom"})
        self.assertEqual(call.call_args[0], ((9.05, 7.49), (9.08, 7.5)))            # restaurant -> customer

    def test_falls_back_to_a_labelled_estimate_when_routing_is_down(self):
        with patch("app.routing.get_route", side_effect=routing.RoutingError("down")):
            body = self.get().json()
        self.assertEqual((body["source"], body["provider"], body["traffic"]), ("estimate", "none", False))
        self.assertGreater(body["distance_km"], 3)
        self.assertGreaterEqual(body["minutes"], 1)

    def test_validation_and_access(self):
        self.assertEqual(self.get(auth={}).status_code, 401)
        self.assertEqual(self.get("nopin").status_code, 422)                         # restaurant never pinned its location
        self.assertEqual(self.get("ghost").status_code, 404)
        self.assertEqual(self.get("directory-5").status_code, 404)
        self.assertEqual(self.get(q="lat=99&lng=7").status_code, 422)
        self.assertEqual(self.get(q="lat=9").status_code, 422)                       # lng missing
        with patch("app.routing.get_route", return_value=routing.Route(0.0, 0.0, 0.0, 0.0, False, "none", [])):
            here = self.get(q="lat=9.05&lng=7.49").json()                            # customer standing at the restaurant
        self.assertEqual((here["distance_km"], here["minutes"]), (0.0, 0))
