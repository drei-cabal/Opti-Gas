from __future__ import annotations

from math import asin, cos, radians, sin, sqrt


EARTH_RADIUS_KM = 6371.0


def haversine_distance_km(
    origin_lat: float,
    origin_lng: float,
    destination_lat: float,
    destination_lng: float,
) -> float:
    lat_delta = radians(destination_lat - origin_lat)
    lng_delta = radians(destination_lng - origin_lng)
    origin_lat_rad = radians(origin_lat)
    destination_lat_rad = radians(destination_lat)

    haversine = (
        sin(lat_delta / 2) ** 2
        + cos(origin_lat_rad) * cos(destination_lat_rad) * sin(lng_delta / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * asin(sqrt(haversine))


def estimate_duration_min(distance_km: float, average_speed_kmh: float = 35.0) -> float:
    if average_speed_kmh <= 0:
        raise ValueError("average_speed_kmh must be positive.")
    if distance_km < 0:
        raise ValueError("distance_km cannot be negative.")

    if distance_km <= 0.3:
        return 1.0

    effective_speed_kmh = _estimate_urban_speed_kmh(distance_km)
    fixed_delay_min = 1.2 if distance_km < 2 else 1.8
    return fixed_delay_min + (distance_km / effective_speed_kmh) * 60.0


def estimate_fallback_duration_min(straight_line_distance_km: float) -> float:
    adjusted_distance_km = estimate_road_distance_km(straight_line_distance_km)
    return estimate_duration_min(adjusted_distance_km)


def estimate_road_distance_km(straight_line_distance_km: float) -> float:
    if straight_line_distance_km < 0:
        raise ValueError("straight_line_distance_km cannot be negative.")

    if straight_line_distance_km <= 0.5:
        multiplier = 1.45
    elif straight_line_distance_km <= 1.5:
        multiplier = 1.35
    elif straight_line_distance_km <= 3:
        multiplier = 1.28
    else:
        multiplier = 1.2

    return straight_line_distance_km * multiplier


def _estimate_urban_speed_kmh(distance_km: float) -> float:
    if distance_km <= 1:
        return 14.0
    if distance_km <= 2.5:
        return 18.0
    if distance_km <= 5:
        return 24.0
    return max(average_speed_floor_kmh(), 30.0)


def average_speed_floor_kmh() -> float:
    return 22.0
