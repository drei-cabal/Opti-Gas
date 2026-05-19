from __future__ import annotations

from haversine import Unit, haversine


# Compute straight-line distance between two coordinates using the library-backed Haversine formula.
def haversine_distance_km(
    origin_lat: float,
    origin_lng: float,
    destination_lat: float,
    destination_lng: float,
) -> float:
    return haversine(
        (origin_lat, origin_lng),
        (destination_lat, destination_lng),
        unit=Unit.KILOMETERS,
    )


# Estimate trip duration in minutes using short-distance city driving heuristics.
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


# Turn a straight-line distance into a fallback trip duration estimate.
def estimate_fallback_duration_min(straight_line_distance_km: float) -> float:
    adjusted_distance_km = estimate_road_distance_km(straight_line_distance_km)
    return estimate_duration_min(adjusted_distance_km)


# Approximate road distance from straight-line distance with distance-based multipliers.
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


# Choose a more realistic urban driving speed for the fallback duration model.
def _estimate_urban_speed_kmh(distance_km: float) -> float:
    if distance_km <= 1:
        return 14.0
    if distance_km <= 2.5:
        return 18.0
    if distance_km <= 5:
        return 24.0
    return max(average_speed_floor_kmh(), 30.0)


# Define the minimum speed floor used by the urban fallback estimator.
def average_speed_floor_kmh() -> float:
    return 22.0
