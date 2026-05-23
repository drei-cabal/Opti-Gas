from __future__ import annotations  # Enable postponed evaluation of type annotations.

from utils.geo.route_estimates import estimate_duration_min, estimate_road_distance_km
from utils.routing.results import build_route_result

FALLBACK_ROUTE_SOURCE = "estimate"


# Build a local route estimate when live road-routing services are unavailable.
def get_estimated_route(
    origin: tuple[float, float],
    station: dict,
) -> dict:
    distance_km = estimate_road_distance_km(origin, (station["lat"], station["lng"]))
    duration_min = estimate_duration_min(distance_km)
    return build_route_result(
        distance_km=distance_km,
        duration_min=duration_min,
        source=FALLBACK_ROUTE_SOURCE,
    )
