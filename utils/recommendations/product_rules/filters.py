# Enable postponed evaluation of type annotations.
from __future__ import annotations

# Use straight-line distance for fast radius prefiltering.
from utils.geo.location import haversine_distance_km


# Keep only stations that match the requested brand unless the request is unrestricted.
def filter_by_brand(stations: list[dict], brand: str) -> list[dict]:
    if not brand or brand.lower() == "any":
        return list(stations)
    expected = brand.strip().lower()
    return [station for station in stations if station["brand"].lower() == expected]


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
