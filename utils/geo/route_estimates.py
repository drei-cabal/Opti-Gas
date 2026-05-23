from __future__ import annotations  # Enable postponed evaluation of type annotations.

from utils.geo.distance import haversine_distance_km

ROAD_DISTANCE_MULTIPLIER = 1.35
AVERAGE_CITY_SPEED_KPH = 25.0


# Estimate a practical driving distance from straight-line geographic distance.
def estimate_road_distance_km(
    origin: tuple[float, float],
    destination: tuple[float, float],
) -> float:
    straight_line_km = haversine_distance_km(
        origin[0],
        origin[1],
        destination[0],
        destination[1],
    )
    return straight_line_km * ROAD_DISTANCE_MULTIPLIER


# Estimate travel duration using the configured city-driving speed assumption.
def estimate_duration_min(distance_km: float) -> float:
    if AVERAGE_CITY_SPEED_KPH <= 0:
        return 0.0
    return (distance_km / AVERAGE_CITY_SPEED_KPH) * 60.0
