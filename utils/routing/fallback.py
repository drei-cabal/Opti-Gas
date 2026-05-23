from __future__ import annotations  # Enable postponed evaluation of type annotations.

from utils.geo.distance import haversine_distance_km
from utils.geo.route_estimates import estimate_duration_min, estimate_road_distance_km
from utils.routing.results import build_route_result

ROUTE_SOURCE_FALLBACK = "haversine"


# Build the local haversine-based route estimate used when remote providers fail.
def build_haversine_route(origin: tuple[float, float], station: dict) -> dict:
    straight_line_distance_km = haversine_distance_km(
        origin[0], origin[1], station["lat"], station["lng"]
    )
    distance_km = estimate_road_distance_km(straight_line_distance_km)
    return build_route_result(
        distance_km=distance_km,
        duration_min=estimate_duration_min(distance_km),
        source=ROUTE_SOURCE_FALLBACK,
    )
