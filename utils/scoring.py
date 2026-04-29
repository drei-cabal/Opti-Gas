from __future__ import annotations


DEFAULT_KM_PER_LITER = 14.0
DEFAULT_LITERS_TO_FILL = 20.0
RECOMMENDATION_MODES = {"opti-route", "shortest", "cheapest"}


def calculate_trip_cost(
    distance_km: float,
    km_per_liter: float = DEFAULT_KM_PER_LITER,
    liters_to_fill: float = DEFAULT_LITERS_TO_FILL,
    price_per_liter: float = 0.0,
) -> float:
    driving_liters = distance_km / km_per_liter
    return (driving_liters + liters_to_fill) * price_per_liter


def round_distance(distance_km: float) -> float:
    return max(0.1, round(distance_km, 1))


def round_duration(duration_min: float) -> float:
    return max(0.5, round(duration_min, 1))


def round_trip_cost(trip_cost: float) -> int:
    return int(round(trip_cost / 10.0) * 10)


def build_sort_key(candidate: dict, mode: str) -> tuple:
    return (
        _primary_metric(candidate, mode),
        candidate["_distance_km_raw"],
        candidate["price"],
        candidate["station_id"],
    )


def _primary_metric(candidate: dict, mode: str) -> float:
    if mode == "shortest":
        return candidate["_distance_km_raw"]
    if mode == "cheapest":
        return candidate["price"]
    return candidate["_trip_cost_raw"]
