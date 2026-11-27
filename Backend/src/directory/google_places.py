"""Google Places (New) photos for directory listings that have none.

This uses Google's official API, never scraping of Maps or Search pages (their terms forbid that). Their terms also say:
  * every Google photo must show Google's credit and the photographer's name -> Listing.image_credit, shown on the cards;
  * the picture itself must not be copied or stored -> only the place id and a photo reference are kept in the database, and
    the browser fetches the picture from Google (through listing_google_photo in api.py) each time it is shown.
Photo references can expire, so the endpoint refreshes them from the place id when Google rejects one.
Each call here is billed by Google: set a budget alert in Google Cloud."""
import json
import math
import re
import urllib.error
import urllib.parse
import urllib.request

API = "https://places.googleapis.com/v1"
TIMEOUT_S = 8
MAX_DISTANCE_KM = 0.35   # a result further than this from the listing's map position is a different place
USER_AGENT = "thekapita-directory/1.0"


class GooglePlacesError(Exception):
    """Google refused or could not be reached. `status` is the HTTP status (0 = network problem)."""

    def __init__(self, message, status=0):
        super().__init__(message)
        self.status = status


def _call(method, url, key, body=None, field_mask=None):
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT, "X-Goog-Api-Key": key}  # the key never goes in a URL
    if field_mask:
        headers["X-Goog-FieldMask"] = field_mask
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:  # noqa: S310 (https URL built above)
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        raise GooglePlacesError(f"Google answered {exc.code}", exc.code) from exc
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        raise GooglePlacesError("Could not reach Google", 0) from exc


def _words(text):
    return {w for w in re.findall(r"[a-z0-9]+", (text or "").casefold()) if len(w) > 2}


def _km(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def _same_place(name, lat, lng, candidate):
    """Only accept Google's answer when it is clearly the same place: a shared word in the name AND close on the map.
    A wrong photo on a restaurant is worse than no photo."""
    got = (candidate.get("displayName") or {}).get("text", "")
    if not _words(name) & _words(got):
        return False
    loc = candidate.get("location") or {}
    if lat is not None and lng is not None and "latitude" in loc and "longitude" in loc:
        return _km(lat, lng, loc["latitude"], loc["longitude"]) <= MAX_DISTANCE_KM
    return lat is None or lng is None  # no position to compare: fall back to the name alone


def _first_photo(place):
    photos = place.get("photos") or []
    if not photos:
        return "", ""
    authors = photos[0].get("authorAttributions") or []
    return photos[0].get("name", ""), (authors[0].get("displayName", "") if authors else "")[:255]


def find_place(key, name, address, lat, lng):
    """-> {"place_id", "photo_name", "author", "matched_name", "photo_count"} for the matching place, or None. photo_name is "" if
    none of the matching places has photos."""
    body = {"textQuery": f"{name} {address}".strip(), "maxResultCount": 3}
    if lat is not None and lng is not None:
        body["locationBias"] = {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 500.0}}
    data = _call("POST", f"{API}/places:searchText", key, body, "places.id,places.displayName,places.location,places.photos")
    best = None
    for candidate in data.get("places") or []:
        if not (candidate.get("id") and _same_place(name, lat, lng, candidate)):
            continue
        photo_name, author = _first_photo(candidate)
        found = {"place_id": candidate["id"], "photo_name": photo_name, "author": author,
                 "matched_name": (candidate.get("displayName") or {}).get("text", ""), "photo_count": len(candidate.get("photos") or [])}
        if photo_name:
            return found  # the first matching place that actually has a photo
        best = best or found
    return best


def refresh_photo(key, place_id):
    """A fresh (photo_name, author) for a place id, or ("", "") if it has no photos any more."""
    data = _call("GET", f"{API}/places/{urllib.parse.quote(place_id, safe='')}", key, field_mask="photos")
    return _first_photo(data)


def photo_uri(key, photo_name, max_width=800):
    """A short-lived Google image address for a photo reference, to redirect the browser to."""
    if not re.fullmatch(r"places/[\w-]+/photos/[\w-]+", photo_name or ""):
        raise GooglePlacesError("bad photo reference", 400)
    query = urllib.parse.urlencode({"maxWidthPx": max_width, "skipHttpRedirect": "true"})
    uri = _call("GET", f"{API}/{photo_name}/media?{query}", key).get("photoUri")
    if not uri or not uri.startswith("https://"):
        raise GooglePlacesError("Google returned no photo", 404)
    return uri
