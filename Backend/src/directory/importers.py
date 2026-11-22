
import json
import re
import sqlite3
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from django.db import transaction

from .classify import classify_restaurant
from .models import Listing

# Approximate box around Abuja city (S, W, N, E): Kubwa and Gwarinpa in the north-west, Lugbe south, Karu / Nyanya
# east. It is a rectangle, not the city limit; adjust with --bbox.
ABUJA_BBOX = (8.85, 7.15, 9.25, 7.65)
LAGOS_BBOX = (6.30, 2.70, 6.80, 3.75)
CITY_BBOXES = {"Abuja": ABUJA_BBOX, "Lagos": LAGOS_BBOX}
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "theKapita-directory-import/1.0"
FOOD_AMENITIES = ("restaurant", "fast_food", "cafe", "food_court")
AMENITY_LABEL = {"fast_food": "Fast food", "cafe": "Cafe", "food_court": "Food court"}
CATEGORY_TAGS = {
    Listing.Category.RESTAURANTS: {
        "amenity": set(FOOD_AMENITIES),
    },
    Listing.Category.HOSPITALS: {
        "amenity": {"hospital", "clinic", "doctors", "dentist", "pharmacy"},
        "healthcare": {"hospital", "clinic", "doctor", "dentist", "pharmacy", "laboratory",
                       "physiotherapist", "rehabilitation", "blood_donation", "birthing_centre"},
    },
    Listing.Category.SCHOOLS: {
        "amenity": {"school", "college", "university", "kindergarten", "language_school", "music_school"},
        "office": {"educational_institution"},
    },
    Listing.Category.GOVERNMENT: {
        "office": {"government"},
        "amenity": {"police", "fire_station", "courthouse", "townhall", "embassy", "prison"},
    },
    Listing.Category.BUSINESSES: {
        "shop": None,
        "craft": None,
        "office": None,
    },
}
ALL_CATEGORIES = tuple(CATEGORY_TAGS)
BATCH = 500

_CONTROL = re.compile(r"[\x00-\x1f\x7f]+")


class ImportErrorMessage(Exception):
    """A problem the person running the import can act on."""


def overpass_query(bbox, timeout=90):
    s, w, n, e = bbox
    amenities = "|".join(FOOD_AMENITIES)
    return f'[out:json][timeout:{timeout}];nwr["amenity"~"^({amenities})$"]({s},{w},{n},{e});out center tags;'


def fetch_overpass(bbox, url=OVERPASS_URL, timeout=120):
    """POST the query to an Overpass server and return its parsed JSON. Public servers are shared: be gentle."""
    body = urllib.parse.urlencode({"data": overpass_query(bbox)}).encode()
    req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (operator-supplied https URL)
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        hint = " The server is busy or rate-limiting you; wait a few minutes or pass another --overpass-url." if exc.code in (429, 504) else ""
        raise ImportErrorMessage(f"Overpass answered HTTP {exc.code}.{hint}") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ImportErrorMessage("Could not reach the Overpass server.") from None
    except ValueError:
        raise ImportErrorMessage("Overpass returned something that is not JSON (it may have timed out).") from None


def _bboxes(bbox):
    if isinstance(bbox, dict):
        return [(name, tuple(bounds)) for name, bounds in bbox.items()]
    return [("", tuple(bbox))]


def _inside(lat, lon, boxes):
    return next(
        (name for name, (south, west, north, east) in boxes
         if south <= lat <= north and west <= lon <= east),
        None,
    )


def read_pbf(path, bbox, categories=None):
    """Read supported directory places from a local OSM PBF extract within one or more boxes."""
    try:
        import osmium
    except ImportError:
        raise ImportErrorMessage("PBF imports require pyosmium; install the backend requirements first.") from None

    boxes = _bboxes(bbox)
    selected = set(categories or ALL_CATEGORIES)
    tag_keys = {
        key
        for category in selected
        for key in CATEGORY_TAGS.get(category, {})
    }

    def center(points):
        points = [(lat, lon) for lat, lon in points if -90 <= lat <= 90 and -180 <= lon <= 180]
        if not points:
            return None
        latitudes, longitudes = zip(*points)
        return (min(latitudes) + max(latitudes)) / 2, (min(longitudes) + max(longitudes)) / 2

    def nearby_locations(connection, node_ids):
        points = []
        node_ids = tuple(set(node_ids))
        for start in range(0, len(node_ids), 500):
            batch = node_ids[start:start + 500]
            placeholders = ",".join("?" for _ in batch)
            points.extend(
                (lat, lon)
                for lat, lon in connection.execute(
                    f"SELECT lat, lon FROM node_locations WHERE id IN ({placeholders})", batch
                )
            )
        return points

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            connection = sqlite3.connect(Path(temp_dir) / "locations.sqlite3")
            try:
                connection.execute("PRAGMA journal_mode=OFF")
                connection.execute("PRAGMA synchronous=OFF")
                connection.execute("CREATE TABLE node_locations (id INTEGER PRIMARY KEY, lat REAL, lon REAL)")
                pending = []

                class LocationIndexer(osmium.SimpleHandler):
                    def node(self, node):
                        if not node.location.valid():
                            return
                        lat, lon = node.location.lat, node.location.lon
                        if any(
                            south - 0.05 <= lat <= north + 0.05
                            and west - 0.05 <= lon <= east + 0.05
                            for _, (south, west, north, east) in boxes
                        ):
                            pending.append((node.id, lat, lon))
                            if len(pending) >= BATCH * 10:
                                connection.executemany(
                                    "INSERT OR REPLACE INTO node_locations VALUES (?, ?, ?)", pending
                                )
                                pending.clear()

                LocationIndexer().apply_file(path)
                if pending:
                    connection.executemany("INSERT OR REPLACE INTO node_locations VALUES (?, ?, ?)", pending)
                connection.commit()

                object_relations = {}
                elements = []
                place_filter = osmium.filter.KeyFilter(*tag_keys)
                place_filter.enable_for(osmium.osm.NODE | osmium.osm.WAY | osmium.osm.RELATION)
                for obj in osmium.FileProcessor(path).with_filter(place_filter):
                    tags = {tag.k: tag.v for tag in obj.tags}
                    category = category_for_tags(tags, selected)
                    if category is None:
                        continue
                    if obj.is_node():
                        if not obj.location.valid():
                            continue
                        lat, lon = obj.location.lat, obj.location.lon
                        city = _inside(lat, lon, boxes)
                        if city is not None:
                            elements.append({
                                "type": "node", "id": obj.id, "lat": lat, "lon": lon, "tags": tags, "city": city,
                            })
                    elif obj.is_way():
                        point = center(nearby_locations(connection, (node.ref for node in obj.nodes)))
                        if point is not None:
                            lat, lon = point
                            city = _inside(lat, lon, boxes)
                            if city is not None:
                                elements.append({
                                    "type": "way", "id": obj.id, "lat": lat, "lon": lon, "tags": tags,
                                    "city": city,
                                })
                    elif obj.is_relation():
                        members = tuple(
                            (member.type, member.ref) for member in obj.members if member.type in ("n", "w")
                        )
                        object_relations[obj.id] = (tags, members)

                relation_way_ids = {
                    ref for _, members in object_relations.values() for kind, ref in members if kind == "w"
                }
                relation_ways = {}
                if relation_way_ids:
                    relation_way_filter = osmium.filter.IdFilter(relation_way_ids)
                    relation_way_filter.enable_for(osmium.osm.WAY)
                    for obj in osmium.FileProcessor(path).with_filter(relation_way_filter):
                        if obj.id in relation_way_ids:
                            relation_ways[obj.id] = nearby_locations(
                                connection, (node.ref for node in obj.nodes)
                            )

                for object_id, (tags, members) in object_relations.items():
                    points = nearby_locations(
                        connection, (ref for kind, ref in members if kind == "n")
                    )
                    for kind, way_id in members:
                        if kind == "w":
                            points.extend(relation_ways.get(way_id, ()))
                    point = center(points)
                    if point is not None:
                        lat, lon = point
                        city = _inside(lat, lon, boxes)
                        if city is not None:
                            elements.append({
                                "type": "relation", "id": object_id, "lat": lat, "lon": lon,
                                "tags": tags, "city": city,
                            })
                return elements
            finally:
                connection.close()
    except (OSError, RuntimeError, sqlite3.Error) as exc:
        raise ImportErrorMessage(f"Could not read OSM PBF file '{path}': {exc}") from None


def _clean(value, limit):
    return _CONTROL.sub(" ", str(value or "")).strip()[:limit].strip()


def _first_phone(tags):
    raw = tags.get("phone") or tags.get("contact:phone") or ""
    return _clean(re.split(r"[;,]", raw)[0], 30)


def _address(tags, city):
    street = " ".join(p for p in (tags.get("addr:housenumber"), tags.get("addr:street")) if p)
    area = tags.get("addr:suburb") or tags.get("addr:neighbourhood") or tags.get("addr:district") or ""
    town = tags.get("addr:city") or city
    seen, parts = set(), []
    for part in (street, area, town):
        part = _clean(part, 120)
        if part and part.lower() not in seen:
            seen.add(part.lower())
            parts.append(part)
    return ", ".join(parts)[:255]


def _services(tags):
    out = []
    label = AMENITY_LABEL.get(tags.get("amenity", ""))
    if label:
        out.append(label)
    for cuisine in re.split(r"[;,]", tags.get("cuisine", "")):
        cuisine = _clean(cuisine.replace("_", " "), 40).title()
        if cuisine and cuisine not in out:
            out.append(cuisine)
    for tag, text in (("delivery", "Delivery"), ("takeaway", "Takeaway"), ("outdoor_seating", "Outdoor seating")):
        if tags.get(tag) == "yes":
            out.append(text)
    if tags.get("internet_access") in ("wlan", "yes"):
        out.append("Wi-Fi")
    for key in ("healthcare", "shop", "craft", "office"):
        value = tags.get(key)
        if value and value not in ("yes", "no", "government", "educational_institution"):
            label = value.replace("_", " ").title()
            if label not in out:
                out.append(label)
    return out[:10]


def category_for_tags(tags, categories=None):
    selected = set(categories or ALL_CATEGORIES)
    amenity = tags.get("amenity")
    priority = (
        Listing.Category.RESTAURANTS,
        Listing.Category.HOSPITALS,
        Listing.Category.SCHOOLS,
        Listing.Category.GOVERNMENT,
        Listing.Category.BUSINESSES,
    )
    for category in priority:
        if category not in selected:
            continue
        for key, values in CATEGORY_TAGS[category].items():
            value = tags.get(key)
            if value and (values is None or value in values):
                return category
    return None


def element_to_fields(el, city="Abuja", categories=None):
    """One Overpass element -> dict of Listing fields, or None when it is not usable (and why is not needed:
    the caller counts it as skipped)."""
    tags = el.get("tags") or {}
    category = category_for_tags(tags, categories)
    if category is None:
        return None
    name = _clean(tags.get("name") or tags.get("name:en"), 150)
    if not name:
        return None
    lat = el.get("lat", (el.get("center") or {}).get("lat"))
    lng = el.get("lon", (el.get("center") or {}).get("lon"))
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180) or el.get("type") not in ("node", "way", "relation") or not el.get("id"):
        return None
    services = _services(tags)
    return {
        "source_id": f'{el["type"]}/{el["id"]}',
        "name": name,
        "category": category,
        "subtype": classify_restaurant(name, "", services) if category == Listing.Category.RESTAURANTS else "",
        "address": _address(tags, el.get("city") or city) or el.get("city") or city,
        "city": el.get("city") or city,
        "phone": _first_phone(tags),
        "hours": _clean(tags.get("opening_hours"), 120),
        "services": services,
        "latitude": round(lat, 6),
        "longitude": round(lng, 6),
    }


IMPORTED = ("name", "category", "subtype", "address", "city", "phone", "hours", "services", "latitude", "longitude")


def import_elements(elements, city="Abuja", dry_run=False, categories=None):
    """Create or refresh listings from Overpass elements. Safe to re-run: rows are matched on (source, source_id).

    Never touches a listing that has an owner: a business that claimed its listing keeps its own edits.
    Returns counts: created, updated, unchanged, claimed (left alone), skipped (unusable)."""
    stats = {"created": 0, "updated": 0, "unchanged": 0, "claimed": 0, "skipped": 0}
    selected = set(categories or ALL_CATEGORIES)
    wanted = {}
    for el in elements:
        tags = el.get("tags") or {}
        if category_for_tags(tags, selected) is None:
            continue
        fields = element_to_fields(el, city, selected)
        if fields is None:
            stats["skipped"] += 1
        else:
            wanted[fields["source_id"]] = fields  # the same element twice in one response: last one wins
    ids = list(wanted)
    for start in range(0, len(ids), BATCH):
        chunk = ids[start:start + BATCH]
        existing = {
            l.source_id: l
            for l in Listing.objects.filter(source=Listing.Source.OSM, source_id__in=chunk)
        }
        to_create, to_update = [], []
        for sid in chunk:
            fields = wanted[sid]
            current = existing.get(sid)
            if current is None:
                stats["created"] += 1
                to_create.append(Listing(
                    source=Listing.Source.OSM, status=Listing.Status.APPROVED,
                    phone=fields["phone"], **{k: v for k, v in fields.items() if k != "phone"},
                ))
            elif current.owner_id:
                stats["claimed"] += 1
            else:
                changed = [k for k in IMPORTED if getattr(current, k) != fields[k]]
                if changed:
                    for k in changed:
                        setattr(current, k, fields[k])
                    to_update.append((current, changed))
                    stats["updated"] += 1
                else:
                    stats["unchanged"] += 1
        if not dry_run:
            with transaction.atomic():
                Listing.objects.bulk_create(to_create, batch_size=BATCH)
                for listing, changed in to_update:
                    listing.save(update_fields=[*changed, "updated_at"])
    return stats
