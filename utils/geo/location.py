# Enable postponed evaluation of type annotations.
from __future__ import annotations

# Use the library-backed Haversine formula for straight-line distance.
from haversine import Unit, haversine


# Compute straight-line distance between two coordinates using the haversine library.
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


# Estimate local fallback drive duration from adjusted road distance.
def estimate_duration_min(distance_km: float, average_speed_kmh: float = 35.0) -> float:
    if average_speed_kmh <= 0:
        raise ValueError("average_speed_kmh must be positive.")
    if distance_km < 0:
        raise ValueError("distance_km cannot be negative.")

    if distance_km <= 0.3:
        return 1.0

    if distance_km <= 1:
        speed_kmh = 14.0
    elif distance_km <= 2.5:
        speed_kmh = 18.0
    elif distance_km <= 5:
        speed_kmh = 24.0
    else:
        speed_kmh = 30.0

    return (1.2 if distance_km < 2 else 1.8) + (distance_km / speed_kmh) * 60.0


# Convert straight-line distance into an approximate local road distance.
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
