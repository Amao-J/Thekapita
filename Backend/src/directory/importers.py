"""Turn OpenStreetMap places into directory listings.

Why OpenStreetMap and not Google Places: Google's terms let you cache a place_id (and coordinates for 30 days) but
not names, addresses or phone numbers, and bar Places content from non-Google maps, so a copied directory of
Google data is not allowed. OSM data may be stored and reused if you credit "(c) OpenStreetMap contributors"
(the listing API returns that credit in `attribution`). OSM is under the ODbL licence, which also has share-alike
terms for *databases* you publish; get that checked by someone qualified before you expose a bulk export.
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request

from django.db import transaction

from .models import Listing

# Approximate box around Abuja city (S, W, N, E): Kubwa and Gwarinpa in the north-west, Lugbe south, Karu / Nyanya
# east. It is a rectangle, not the city limit; adjust with --bbox.
ABUJA_BBOX = (8.85, 7.15, 9.25, 7.65)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "theKapita-directory-import/1.0"
FOOD_AMENITIES = ("restaurant", "fast_food", "cafe", "food_court")
AMENITY_LABEL = {"fast_food": "Fast food", "cafe": "Cafe", "food_court": "Food court"}
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


def read_pbf(path, bbox):
    """Read food-place objects from a local OSM PBF extract within bbox."""
    try:
        import osmium
    except ImportError:
        raise ImportErrorMessage("PBF imports require pyosmium; install the backend requirements first.") from None

    south, west, north, east = bbox

    def center(points):
        points = [(lat, lon) for lat, lon in points if -90 <= lat <= 90 and -180 <= lon <= 180]
        if not points:
            return None
        latitudes, longitudes = zip(*points)
        return (min(latitudes) + max(latitudes)) / 2, (min(longitudes) + max(longitudes)) / 2

    try:
        food_ways = {}
        food_relations = {}
        elements = []
        food_filter = osmium.filter.TagFilter(*(("amenity", value) for value in FOOD_AMENITIES))
        food_filter.enable_for(osmium.osm.NODE | osmium.osm.WAY | osmium.osm.RELATION)
        for obj in osmium.FileProcessor(path).with_filter(food_filter):
            if obj.is_node():
                if not obj.location.valid():
                    continue
                tags = {tag.k: tag.v for tag in obj.tags}
                lat, lon = obj.location.lat, obj.location.lon
                if (
                    tags.get("amenity") in FOOD_AMENITIES
                    and south <= lat <= north
                    and west <= lon <= east
                ):
                    elements.append({"type": "node", "id": obj.id, "lat": lat, "lon": lon, "tags": tags})
            elif obj.is_way():
                tags = {tag.k: tag.v for tag in obj.tags}
                if tags.get("amenity") in FOOD_AMENITIES:
                    food_ways[obj.id] = (tags, tuple(node.ref for node in obj.nodes))
            elif obj.is_relation():
                tags = {tag.k: tag.v for tag in obj.tags}
                if tags.get("amenity") in FOOD_AMENITIES:
                    members = tuple(
                        (member.type, member.ref) for member in obj.members if member.type in ("n", "w")
                    )
                    food_relations[obj.id] = (tags, members)

        relation_way_ids = {
            ref for _, members in food_relations.values() for kind, ref in members if kind == "w"
        } - food_ways.keys()
        relation_ways = {}
        if relation_way_ids:
            relation_way_filter = osmium.filter.IdFilter(relation_way_ids)
            relation_way_filter.enable_for(osmium.osm.WAY)
            for obj in osmium.FileProcessor(path).with_filter(relation_way_filter):
                if obj.id in relation_way_ids:
                    relation_ways[obj.id] = tuple(node.ref for node in obj.nodes)

        node_ids = {
            ref for _, refs in food_ways.values() for ref in refs
        } | {
            ref for _, members in food_relations.values() for kind, ref in members if kind == "n"
        } | {
            ref for refs in relation_ways.values() for ref in refs
        }
        locations = {}
        if node_ids:
            node_filter = osmium.filter.IdFilter(node_ids)
            node_filter.enable_for(osmium.osm.NODE)
            for obj in osmium.FileProcessor(path).with_filter(node_filter):
                if obj.id in node_ids and obj.location.valid():
                    locations[obj.id] = (obj.location.lat, obj.location.lon)

        def append_feature(kind, object_id, tags, refs):
            point = center(locations[ref] for ref in refs if ref in locations)
            if point is None:
                return
            lat, lon = point
            if south <= lat <= north and west <= lon <= east:
                elements.append({"type": kind, "id": object_id, "lat": lat, "lon": lon, "tags": tags})

        for object_id, (tags, refs) in food_ways.items():
            append_feature("way", object_id, tags, refs)
        for object_id, (tags, members) in food_relations.items():
            refs = [ref for kind, ref in members if kind == "n"]
            for kind, way_id in members:
                if kind == "w":
                    refs.extend(relation_ways.get(way_id, ()))
            append_feature("relation", object_id, tags, refs)
    except (OSError, RuntimeError) as exc:
        raise ImportErrorMessage(f"Could not read OSM PBF file '{path}': {exc}") from None
    return elements


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
    return out[:10]


def element_to_fields(el, city="Abuja"):
    """One Overpass element -> dict of Listing fields, or None when it is not usable (and why is not needed:
    the caller counts it as skipped)."""
    tags = el.get("tags") or {}
    if tags.get("amenity") not in FOOD_AMENITIES:
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
    return {
        "source_id": f'{el["type"]}/{el["id"]}',
        "name": name,
        "category": Listing.Category.RESTAURANTS,
        "address": _address(tags, city) or city,
        "city": city,
        "phone": _first_phone(tags),
        "hours": _clean(tags.get("opening_hours"), 120),
        "services": _services(tags),
        "latitude": round(lat, 6),
        "longitude": round(lng, 6),
    }


IMPORTED = ("name", "category", "address", "city", "phone", "hours", "services", "latitude", "longitude")


def import_elements(elements, city="Abuja", dry_run=False):
    """Create or refresh listings from Overpass elements. Safe to re-run: rows are matched on (source, source_id).

    Never touches a listing that has an owner: a business that claimed its listing keeps its own edits.
    Returns counts: created, updated, unchanged, claimed (left alone), skipped (unusable)."""
    stats = {"created": 0, "updated": 0, "unchanged": 0, "claimed": 0, "skipped": 0}
    wanted = {}
    for el in elements:
        fields = element_to_fields(el, city)
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
