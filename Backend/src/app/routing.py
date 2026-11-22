"""Road routing for ride distance + arrival-time estimates.

Providers (settings.ROUTING_PROVIDER):
  * "tomtom": road distance + traffic-aware travel time. Needs TOMTOM_API_KEY. Works with any map (Leaflet).
  * "osrm"  : road distance + typical travel time, no live traffic. Free public demo server by default, which
              is for light/non-commercial use only -- point OSRM_BASE_URL at your own server for production.
If the primary provider fails (quota, outage, missing key) we fall back to OSRM so a ride is never blocked.

Why on the server: the TomTom key stays secret, answers are cached, and there is one place to later compute
fares from a trusted distance instead of one the browser sends.

Not supported on purpose: Google. Google's terms bar showing Directions data on a non-Google map, so Google routes
only make sense together with Google's own map (a different front end than this Leaflet one).
"""
import json
import logging
import math
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

MAX_POINTS = 300          # thin long polylines so the response stays small
MAX_STRAIGHT_KM = 1500    # beyond this a road estimate is not meaningful for a ride
TIMEOUT_S = 6
USER_AGENT = "theKapita/1.0 (ride estimates)"  # the OSRM demo server requires an identifying agent


class RoutingError(Exception):
    """The provider could not produce a route. Messages never include URLs or keys."""


@dataclass
class Route:
    distance_km: float
    duration_min: float                 # with live traffic when the provider knows it
    duration_no_traffic_min: float
    traffic_delay_min: float
    traffic: bool                       # True only when live traffic was factored in
    provider: str
    geometry: list = field(default_factory=list)  # [[lat, lng], ...]


def haversine_km(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def _http_json(url):
    """GET a URL and parse JSON. Kept tiny so tests can replace it; never log `url` (it carries the API key)."""
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:  # noqa: S310 (https URLs we build ourselves)
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RoutingError(f"routing provider answered HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        raise RoutingError("routing provider unreachable or returned invalid data") from None


def _thin(points):
    if len(points) <= MAX_POINTS:
        return points
    step = math.ceil(len(points) / MAX_POINTS)
    thinned = points[::step]
    if thinned[-1] != points[-1]:
        thinned.append(points[-1])
    return thinned


def _mins(seconds):
    return round(seconds / 60, 1)


def _tomtom(o, d):
    key = getattr(settings, "TOMTOM_API_KEY", "")
    if not key:
        raise RoutingError("TomTom is not configured")
    query = urllib.parse.urlencode({
        "key": key, "traffic": "true", "travelMode": "car", "routeType": "fastest", "computeTravelTimeFor": "all",
    })
    data = _http_json(f"https://api.tomtom.com/routing/1/calculateRoute/{o[0]},{o[1]}:{d[0]},{d[1]}/json?{query}")
    try:
        route = data["routes"][0]
        s = route["summary"]
        total = float(s["travelTimeInSeconds"])
        delay = float(s.get("trafficDelayInSeconds") or 0)
        free_flow = float(s.get("noTrafficTravelTimeInSeconds") or max(total - delay, 0))
        points = [[p["latitude"], p["longitude"]] for leg in route["legs"] for p in leg["points"]]
        return Route(
            distance_km=round(float(s["lengthInMeters"]) / 1000, 2), duration_min=_mins(total),
            duration_no_traffic_min=_mins(free_flow), traffic_delay_min=_mins(delay),
            traffic=True, provider="tomtom", geometry=_thin(points),
        )
    except (KeyError, IndexError, TypeError, ValueError):
        raise RoutingError("unexpected TomTom response") from None


def _osrm(o, d):
    base = getattr(settings, "OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
    query = urllib.parse.urlencode({"overview": "full", "geometries": "geojson"})
    data = _http_json(f"{base}/route/v1/driving/{o[1]},{o[0]};{d[1]},{d[0]}?{query}")  # OSRM wants lng,lat
    try:
        route = data["routes"][0]
        seconds = float(route["duration"])
        points = [[lat, lng] for lng, lat in route["geometry"]["coordinates"]]
        return Route(
            distance_km=round(float(route["distance"]) / 1000, 2), duration_min=_mins(seconds),
            duration_no_traffic_min=_mins(seconds), traffic_delay_min=0.0,
            traffic=False, provider="osrm", geometry=_thin(points),
        )
    except (KeyError, IndexError, TypeError, ValueError):
        raise RoutingError("unexpected OSRM response") from None


PROVIDERS = {"tomtom": _tomtom, "osrm": _osrm}


def get_route(origin, destination) -> Route:
    """origin/destination: (lat, lng). Cached briefly: live-traffic answers go stale fast, free-flow ones don't."""
    o = (round(origin[0], 5), round(origin[1], 5))
    d = (round(destination[0], 5), round(destination[1], 5))
    if haversine_km(*o, *d) < 0.02:  # same spot: nothing to route (providers reject identical points)
        return Route(0.0, 0.0, 0.0, 0.0, False, "none", [])

    primary = getattr(settings, "ROUTING_PROVIDER", "osrm")
    # ~11 m grid so two nearly identical requests share one provider call
    cache_key = f"route:{primary}:{o[0]:.4f},{o[1]:.4f}:{d[0]:.4f},{d[1]:.4f}"
    cached = cache.get(cache_key)
    if cached:
        return Route(**cached)

    order = [primary] + (["osrm"] if primary != "osrm" else [])
    last_error = None
    for name in order:
        try:
            route = PROVIDERS[name](o, d)
        except (RoutingError, KeyError) as exc:
            last_error = exc
            logger.warning("routing provider %s failed: %s", name, exc)
            continue
        cache.set(cache_key, asdict(route), 60 if route.traffic else 600)
        return route
    raise RoutingError(str(last_error or "no routing provider available"))
