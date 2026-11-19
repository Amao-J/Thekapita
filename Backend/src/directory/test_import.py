import json
import os
import tempfile
import urllib.error
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.db import IntegrityError, transaction
from django.test import TestCase

from app.auth import issue_token_pair

from . import importers
from .models import Listing

User = get_user_model()


def node(i, name="Place", lat=9.05, lon=7.49, **tags):
    return {"type": "node", "id": i, "lat": lat, "lon": lon, "tags": {"amenity": "restaurant", "name": name, **tags}}


FIXTURE = {"elements": [
    node(1, "Mama Put Kitchen", **{"addr:housenumber": "12", "addr:street": "Ademola Adetokunbo Crescent",
                                   "addr:suburb": "Wuse 2", "phone": "+234 803 000 0001; +234 803 000 0002",
                                   "opening_hours": "Mo-Su 08:00-22:00", "cuisine": "nigerian;local_buka",
                                   "delivery": "yes", "takeaway": "yes", "internet_access": "wlan"}),
    {"type": "way", "id": 77, "center": {"lat": 9.06, "lon": 7.5}, "tags": {"amenity": "fast_food", "name": "Quick Bites"}},
    {"type": "relation", "id": 5, "center": {"lat": 9.07, "lon": 7.51}, "tags": {"amenity": "cafe", "name": "Cafe Uno"}},
    {"type": "node", "id": 9, "lat": 9.1, "lon": 7.4, "tags": {"amenity": "restaurant"}},                 # no name
    {"type": "node", "id": 10, "lat": 9.1, "lon": 7.4, "tags": {"amenity": "drinking_water", "name": "Not a directory place"}},
    {"type": "node", "id": 11, "tags": {"amenity": "restaurant", "name": "No position"}},                     # no coords
    {"type": "node", "id": 12, "lat": 999, "lon": 7.4, "tags": {"amenity": "restaurant", "name": "Bad lat"}},  # invalid
]}


class MappingTests(TestCase):
    def test_maps_tags_to_listing_fields(self):
        f = importers.element_to_fields(FIXTURE["elements"][0])
        self.assertEqual(f["source_id"], "node/1")
        self.assertEqual(f["category"], "restaurants")
        self.assertEqual(f["address"], "12 Ademola Adetokunbo Crescent, Wuse 2, Abuja")
        self.assertEqual(f["phone"], "+234 803 000 0001")          # first of several
        self.assertEqual(f["hours"], "Mo-Su 08:00-22:00")
        self.assertEqual(f["services"], ["Nigerian", "Local Buka", "Delivery", "Takeaway", "Wi-Fi"])
        self.assertEqual((f["latitude"], f["longitude"]), (9.05, 7.49))

    def test_ways_and_relations_use_their_centre_and_label_the_kind(self):
        way = importers.element_to_fields(FIXTURE["elements"][1])
        self.assertEqual((way["source_id"], way["latitude"], way["address"]), ("way/77", 9.06, "Abuja"))
        self.assertEqual(way["services"], ["Fast food"])
        self.assertEqual(importers.element_to_fields(FIXTURE["elements"][2])["services"], ["Cafe"])

    def test_unusable_elements_are_rejected(self):
        for el in FIXTURE["elements"][3:]:
            self.assertIsNone(importers.element_to_fields(el), el)

    def test_text_is_cleaned_and_truncated(self):
        f = importers.element_to_fields(node(3, "Bad\x00Name\n" + "x" * 300, phone="1" * 80))
        self.assertNotIn("\x00", f["name"])
        self.assertNotIn("\n", f["name"])
        self.assertLessEqual(len(f["name"]), 150)
        self.assertLessEqual(len(f["phone"]), 30)

    def test_missing_phone_is_empty_not_none(self):
        self.assertEqual(importers.element_to_fields(node(4))["phone"], "")

    def test_maps_supported_directory_categories_from_osm_tags(self):
        examples = [
            ({"amenity": "hospital"}, "hospitals"),
            ({"healthcare": "pharmacy"}, "hospitals"),
            ({"amenity": "school"}, "schools"),
            ({"office": "government"}, "government"),
            ({"shop": "supermarket"}, "businesses"),
            ({"craft": "carpenter"}, "businesses"),
        ]
        for index, (tags, category) in enumerate(examples, 20):
            with self.subTest(category=category, tags=tags):
                mapped = importers.element_to_fields({
                    "type": "node", "id": index, "lat": 9.05, "lon": 7.49,
                    "tags": {"name": "Place", **tags},
                })
                self.assertEqual(mapped["category"], category)

    def test_category_selection_limits_import_mapping(self):
        place = node(30, amenity="school")
        self.assertIsNone(importers.element_to_fields(place, categories=("restaurants",)))
        self.assertEqual(
            importers.element_to_fields(place, categories=("schools",))["category"],
            "schools",
        )


class ImportTests(TestCase):
    def run_import(self, elements=None, **kw):
        return importers.import_elements(FIXTURE["elements"] if elements is None else elements, **kw)

    def test_creates_approved_unverified_osm_listings(self):
        stats = self.run_import()
        self.assertEqual(stats, {"created": 3, "updated": 0, "unchanged": 0, "claimed": 0, "skipped": 3})
        l = Listing.objects.get(source_id="node/1")
        self.assertEqual((l.status, l.source, l.is_verified, l.owner_id), ("approved", "osm", False, None))

    def test_rerunning_is_idempotent_and_refreshes_changes(self):
        self.run_import()
        self.assertEqual(self.run_import(), {"created": 0, "updated": 0, "unchanged": 3, "claimed": 0, "skipped": 3})
        changed = [node(1, "Mama Put Kitchen Renamed", lat=9.05, lon=7.49)] + FIXTURE["elements"][1:3]
        stats = self.run_import(changed)
        self.assertEqual((stats["created"], stats["updated"], stats["unchanged"]), (0, 1, 2))
        self.assertEqual(Listing.objects.get(source_id="node/1").name, "Mama Put Kitchen Renamed")
        self.assertEqual(Listing.objects.filter(source="osm").count(), 3)

    def test_a_claimed_listing_keeps_its_owner_edits(self):
        self.run_import()
        owner = User.objects.create_user("o", "o@example.com", "pw-12345")
        Listing.objects.filter(source_id="node/1").update(owner=owner, name="Our Own Name", phone="08011112222")
        stats = self.run_import()
        self.assertEqual(stats["claimed"], 1)
        l = Listing.objects.get(source_id="node/1")
        self.assertEqual((l.name, l.phone), ("Our Own Name", "08011112222"))

    def test_dry_run_counts_but_writes_nothing(self):
        stats = self.run_import(dry_run=True)
        self.assertEqual(stats["created"], 3)
        self.assertEqual(Listing.objects.count(), 0)

    def test_duplicate_elements_in_one_response_are_collapsed(self):
        self.assertEqual(self.run_import([node(1, "A"), node(1, "B")])["created"], 1)
        self.assertEqual(Listing.objects.get(source_id="node/1").name, "B")

    def test_large_import_works_in_batches(self):
        els = [node(i, f"Eatery {i}", lat=9.0 + (i % 100) / 1000, lon=7.4 + (i % 100) / 1000) for i in range(1, 1301)]
        self.assertEqual(self.run_import(els)["created"], 1300)
        # No per-row queries: 3 batches of <=500, each = 1 lookup + a savepoint (begin + release) = 9 in total.
        with self.assertNumQueries(9):
            self.assertEqual(self.run_import(els)["unchanged"], 1300)

    def test_unique_constraint_blocks_duplicate_source_ids_but_not_blank_ones(self):
        self.run_import()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Listing.objects.create(name="Dup", category="restaurants", address="x", phone="1", source="osm", source_id="node/1")
        for n in ("A", "B"):  # user-submitted rows have no source id and may repeat
            Listing.objects.create(name=n, category="restaurants", address="x", phone="1")


class PBFReadTests(TestCase):
    def test_extracts_nodes_ways_and_relations_inside_bbox(self):
        class FakeProcessor:
            def __init__(self, objects):
                self.objects = objects

            def with_filter(self, _filter):
                return self

            def with_locations(self, storage="flex_mem"):
                return self

            def __iter__(self):
                return iter(self.objects)

        class Tag:
            def __init__(self, key, value):
                self.k, self.v = key, value

        class Location:
            def __init__(self, lat, lon):
                self.lat, self.lon = lat, lon

            def valid(self):
                return True

        class Object:
            def __init__(self, kind, object_id, tags, refs=(), node_locations=(), location=None, members=()):
                self.kind, self.id = kind, object_id
                self.tags = [Tag(*tag) for tag in tags.items()]
                self.nodes = [
                    type("NodeRef", (), {"ref": ref, "location": node_locations[index]})()
                    for index, ref in enumerate(refs)
                ]
                self.location = location
                self.members = [type("Member", (), {"type": kind, "ref": ref})() for kind, ref in members]

            def is_node(self):
                return self.kind == "node"

            def is_way(self):
                return self.kind == "way"

            def is_relation(self):
                return self.kind == "relation"

        first_pass = [
            Object("node", 1, {"amenity": "restaurant", "name": "Node Eatery"},
                   location=Location(9.0, 7.3)),
            Object("node", 2, {"amenity": "restaurant", "name": "Outside"},
                   location=Location(10.0, 7.3)),
            Object("way", 10, {"amenity": "fast_food", "name": "Way Eatery"}, refs=(100, 101),
                   node_locations=(Location(9.0, 7.3), Location(9.1, 7.5))),
            Object("relation", 20, {"amenity": "cafe", "name": "Relation Cafe"}, members=(("w", 30),)),
        ]
        relation_ways = [Object("way", 30, {}, refs=(102, 103),
                                node_locations=(Location(9.08, 7.4), Location(9.12, 7.6)))]
        nodes = [
            Object("node", 100, {}, location=Location(9.0, 7.3)),
            Object("node", 101, {}, location=Location(9.1, 7.5)),
            Object("node", 102, {}, location=Location(9.08, 7.4)),
            Object("node", 103, {}, location=Location(9.12, 7.6)),
        ]
        class FakeSimpleHandler:
            def apply_file(self, _path):
                for obj in nodes:
                    self.node(obj)

        with (
            mock.patch("osmium.SimpleHandler", FakeSimpleHandler),
            mock.patch("osmium.FileProcessor", side_effect=[
                FakeProcessor(first_pass), FakeProcessor(relation_ways),
            ]),
        ):
            elements = importers.read_pbf(
                "extract.osm.pbf", importers.ABUJA_BBOX, ("restaurants",)
            )

        self.assertEqual([(el["type"], el["id"]) for el in elements], [
            ("node", 1), ("way", 10), ("relation", 20),
        ])
        self.assertEqual((elements[1]["lat"], elements[1]["lon"]), (9.05, 7.4))
        self.assertEqual((elements[2]["lat"], elements[2]["lon"]), (9.1, 7.5))


class CommandTests(TestCase):
    def call(self, *args):
        out = StringIO()
        call_command("import_osm_places", *args, stdout=out)
        return out.getvalue()

    def test_file_import_and_summary(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump(FIXTURE, fh)
        self.addCleanup(os.unlink, fh.name)
        self.assertIn("Would change: 3 new", self.call("--file", fh.name, "--dry-run"))
        self.assertEqual(Listing.objects.count(), 0)
        out = self.call("--file", fh.name)
        self.assertIn("Done: 3 new", out)
        self.assertIn("OpenStreetMap contributors", out)

    def test_pbf_option_reads_local_extract_with_the_requested_bbox(self):
        with mock.patch.object(importers, "read_pbf", return_value=FIXTURE["elements"]) as read_pbf:
            out = self.call("--pbf", "nigeria.osm.pbf", "--bbox", "8.9,7.2,9.2,7.6", "--dry-run")
        read_pbf.assert_called_once_with("nigeria.osm.pbf", (8.9, 7.2, 9.2, 7.6), ("restaurants",))
        self.assertIn("Would change: 3 new", out)

    def test_pbf_command_accepts_city_boxes_and_all_categories(self):
        with mock.patch.object(importers, "read_pbf", return_value=FIXTURE["elements"]) as read_pbf:
            out = self.call("--pbf", "nigeria.osm.pbf", "--cities", "Abuja,Lagos",
                            "--categories", "all", "--dry-run")
        read_pbf.assert_called_once_with(
            "nigeria.osm.pbf", importers.CITY_BBOXES, importers.ALL_CATEGORIES
        )
        self.assertIn("Would change: 3 new", out)

    def test_pbf_command_exports_reusable_json_snapshot(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            export_path = fh.name
        self.addCleanup(os.unlink, export_path)
        with mock.patch.object(importers, "read_pbf", return_value=FIXTURE["elements"]):
            out = self.call(
                "--pbf", "nigeria.osm.pbf", "--cities", "Abuja,Lagos", "--categories", "all",
                "--export-json", export_path, "--dry-run",
            )
        with open(export_path, encoding="utf-8") as fh:
            snapshot = json.load(fh)
        self.assertIn("Saved PBF data snapshot", out)
        self.assertEqual(snapshot["source"], "OpenStreetMap")
        self.assertEqual(snapshot["cities"], ["Abuja", "Lagos"])
        self.assertEqual(snapshot["elements"], FIXTURE["elements"])
        self.assertIn("Would change: 3 new", self.call(
            "--file", export_path, "--categories", "all", "--dry-run"
        ))

    def test_bad_input_gives_clear_errors(self):
        with self.assertRaises(CommandError):
            self.call("--file", "/nonexistent.json")
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"hello": "world"}, fh)
        self.addCleanup(os.unlink, fh.name)
        with self.assertRaisesRegex(CommandError, "not an Overpass result"):
            self.call("--file", fh.name)
        for bad in ("1,2,3", "a,b,c,d", "9.3,7,9.0,8", "0,0,90,90"):  # arity, non-numeric, inverted, far too big
            with self.assertRaises(CommandError, msg=bad):
                self.call("--bbox", bad)

    def test_overpass_request_shape_and_errors(self):
        class Resp:
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self): return json.dumps(FIXTURE).encode()

        with mock.patch("urllib.request.urlopen", return_value=Resp()) as call:
            out = self.call("--bbox", "8.85,7.15,9.25,7.65")
        req = call.call_args[0][0]
        body = req.data.decode()
        self.assertIn("restaurant%7Cfast_food%7Ccafe%7Cfood_court", body)
        self.assertIn("8.85%2C7.15%2C9.25%2C7.65", body)
        self.assertIn("theKapita", req.get_header("User-agent"))
        self.assertIn("3 new", out)

        err = urllib.error.HTTPError("u", 429, "Too Many", {}, None)
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaisesRegex(CommandError, "rate-limiting"):
                self.call()
        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("down")):
            with self.assertRaisesRegex(CommandError, "Could not reach"):
                self.call()


class ListingApiAtScaleTests(TestCase):
    """The list endpoint must rank and page correctly with thousands of imported rows."""

    @classmethod
    def setUpTestData(cls):
        rows = [
            Listing(name=f"Eatery {i:04d}", category="restaurants", address="Abuja", phone="", status="approved",
                    source="osm", source_id=f"node/{i}", latitude=9.0 + (i % 50) * 0.002, longitude=7.4)
            for i in range(1, 621)
        ]
        # alphabetically LAST but physically nearest to the test user, plus a far-away one that sorts first
        rows.append(Listing(name="Zzz Nearest Buka", category="restaurants", address="Wuse", phone="", status="approved",
                            source="osm", source_id="node/9001", latitude=9.0765, longitude=7.4951))
        rows.append(Listing(name="Aaa Faraway", category="restaurants", address="Lagos", phone="", status="approved",
                            latitude=6.5, longitude=3.4))
        rows.append(Listing(name="Aab No Coordinates", category="restaurants", address="Somewhere", phone="", status="approved"))
        Listing.objects.bulk_create(rows)

    def test_paging_goes_past_500_without_gaps_or_repeats(self):
        seen = []
        for offset in range(0, 700, 100):
            page = self.client.get(f"/api/directory/listings?category=restaurants&limit=100&offset={offset}").json()
            seen += [l["id"] for l in page]
        self.assertEqual(len(seen), 623)
        self.assertEqual(len(set(seen)), 623)

    def test_nearest_is_chosen_from_all_rows_not_the_first_alphabetically(self):
        res = self.client.get("/api/directory/listings?category=restaurants&lat=9.0765&lng=7.4951&limit=5").json()
        self.assertEqual(res[0]["name"], "Zzz Nearest Buka")
        self.assertLess(res[0]["distance_km"], 0.1)
        self.assertNotIn("Aaa Faraway", [l["name"] for l in res])

    def test_listings_without_a_position_are_still_listed_but_after_located_ones(self):
        res = self.client.get("/api/directory/listings?category=restaurants&lat=9.0765&lng=7.4951&limit=100&offset=600").json()
        names = [l["name"] for l in res]
        self.assertEqual(names[-1], "Aab No Coordinates")
        self.assertEqual(len(res), 23)

    def test_far_from_everything_still_returns_a_page(self):
        res = self.client.get("/api/directory/listings?category=restaurants&lat=-30&lng=25&limit=3").json()
        self.assertEqual(len(res), 3)

    def test_attribution_only_on_osm_rows(self):
        by = {l["name"]: l for l in self.client.get("/api/directory/listings?category=restaurants&limit=100&q=Aaa").json()}
        self.assertIsNone(by["Aaa Faraway"]["attribution"])
        osm = self.client.get("/api/directory/listings?q=Zzz").json()[0]
        self.assertEqual(osm["attribution"], "\u00A9 OpenStreetMap contributors")

    def test_search_understands_restaurants_and_ranks_by_distance(self):
        res = self.client.get("/api/directory/search?q=restaurant in wuse&lat=9.0765&lng=7.4951").json()
        self.assertEqual(res["intent"], {"category": "restaurants", "keywords": ["wuse"]})
        self.assertEqual([l["name"] for l in res["results"]], ["Zzz Nearest Buka"])
        res = self.client.get("/api/directory/search?q=suya food&lat=9.0765&lng=7.4951").json()
        self.assertEqual(res["intent"]["category"], "restaurants")
        self.assertEqual(res["results"][0]["name"], "Zzz Nearest Buka")  # nearest first, not A-Z
