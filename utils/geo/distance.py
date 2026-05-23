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
