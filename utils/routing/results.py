from __future__ import annotations  # Enable postponed evaluation of type annotations.


# Standardize the route payload shape returned by all providers.
def build_route_result(distance_km: float, duration_min: float, source: str) -> dict:
    return {
        "distance_km": distance_km,
        "duration_min": duration_min,
        "source": source,
    }
