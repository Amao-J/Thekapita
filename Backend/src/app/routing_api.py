from ninja import Field, Query, Router, Schema
from ninja.errors import HttpError

from . import routing
from .auth import JWTAuth
from .throttles import user_throttle

routing_router = Router(auth=JWTAuth())


class RouteQuery(Schema):
    from_lat: float = Field(ge=-90, le=90)
    from_lng: float = Field(ge=-180, le=180)
    to_lat: float = Field(ge=-90, le=90)
    to_lng: float = Field(ge=-180, le=180)


class RouteOut(Schema):
    distance_km: float
    duration_min: float                  # includes live traffic when `traffic` is true
    duration_no_traffic_min: float
    traffic_delay_min: float
    traffic: bool
    provider: str
    geometry: list[list[float]]          # [[lat, lng], ...] ready for L.polyline


@routing_router.get("/route", response=RouteOut, throttle=[user_throttle("routing", "60/m")])
def road_route(request, q: Query[RouteQuery]):
    if routing.haversine_km(q.from_lat, q.from_lng, q.to_lat, q.to_lng) > routing.MAX_STRAIGHT_KM:
        raise HttpError(422, "These two points are too far apart for a road route estimate.")
    try:
        route = routing.get_route((q.from_lat, q.from_lng), (q.to_lat, q.to_lng))
    except routing.RoutingError:
        raise HttpError(502, "Road routing is unavailable right now.")
    return route
