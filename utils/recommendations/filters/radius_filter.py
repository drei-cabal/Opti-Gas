# Enable postponed evaluation of type annotations.
from __future__ import annotations

# Use straight-line distance for fast radius prefiltering.
from utils.geo.distance import haversine_distance_km


# Keep only stations that fall within the requested radius from the user origin.
def filter_by_radius(
    stations: list[dict],
    origin: tuple[float, float],
    radius_km: float,
) -> list[dict]:
    origin_lat, origin_lng = origin
    filtered: list[dict] = []
    for station in stations:
        distance = haversine_distance_km(
            origin_lat,
            origin_lng,
            station["lat"],
            station["lng"],
        )
        if distance <= radius_km:
            filtered.append(station)
    return filtered
