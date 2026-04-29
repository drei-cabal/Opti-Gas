from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from utils.filters import filter_by_brand, filter_by_radius
from utils.routing import get_route
from utils.scoring import (
    DEFAULT_KM_PER_LITER,
    DEFAULT_LITERS_TO_FILL,
    build_sort_key,
    calculate_trip_cost,
    round_distance,
    round_duration,
    round_trip_cost,
)
from utils.station_store import get_station_id, is_stale_price

MAX_ROUTE_WORKERS = 6


def recommend_stations(
    stations: list[dict],
    origin: tuple[float, float],
    mode: str,
    brand: str,
    fuel_type: str,
    radius_km: float,
    ors_api_key: str | None = None,
) -> dict:
    filtered = _filter_candidate_stations(stations, origin, brand, radius_km)
    candidates = _build_candidates(filtered, origin, fuel_type, ors_api_key)
    fallback_warning = any(
        candidate["distance_source"] == "haversine" for candidate in candidates
    )

    candidates.sort(key=lambda candidate: build_sort_key(candidate, mode))
    best = candidates[0] if candidates else None

    public_candidates = [_strip_internal_fields(candidate) for candidate in candidates]
    return {
        "best": _strip_internal_fields(best) if best else None,
        "candidates": public_candidates,
        "fallback_warning": fallback_warning,
    }


def _build_candidates(
    stations: list[dict],
    origin: tuple[float, float],
    fuel_type: str,
    ors_api_key: str | None,
) -> list[dict]:
    if len(stations) <= 1:
        candidate = _build_candidate(
            stations[0], origin, fuel_type, ors_api_key
        ) if stations else None
        return [candidate] if candidate else []

    max_workers = min(MAX_ROUTE_WORKERS, len(stations))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        built_candidates = list(
            executor.map(
                lambda station: _build_candidate(station, origin, fuel_type, ors_api_key),
                stations,
            )
        )
    return [candidate for candidate in built_candidates if candidate is not None]


def _filter_candidate_stations(
    stations: list[dict],
    origin: tuple[float, float],
    brand: str,
    radius_km: float,
) -> list[dict]:
    filtered = filter_by_brand(stations, brand)
    return filter_by_radius(filtered, origin, radius_km)


def _build_candidate(
    station: dict,
    origin: tuple[float, float],
    fuel_type: str,
    ors_api_key: str | None,
) -> dict | None:
    selected_fuel = _find_station_fuel(station, fuel_type)
    if selected_fuel is None:
        return None

    route = get_route(origin, station, ors_api_key=ors_api_key)
    trip_cost = calculate_trip_cost(
        distance_km=route["distance_km"],
        km_per_liter=DEFAULT_KM_PER_LITER,
        liters_to_fill=DEFAULT_LITERS_TO_FILL,
        price_per_liter=selected_fuel["price"],
    )
    return {
        "station_id": get_station_id(station),
        "name": station["name"],
        "brand": station["brand"],
        "lat": station["lat"],
        "lng": station["lng"],
        "price": round(float(selected_fuel["price"]), 2),
        "fuel_type": selected_fuel["fuel_type"],
        "last_updated": selected_fuel["last_updated"],
        "available_fuel_types": [fuel["fuel_type"] for fuel in station["fuels"]],
        "distance_km": round_distance(route["distance_km"]),
        "duration_min": round_duration(route["duration_min"]),
        "trip_cost": round_trip_cost(trip_cost),
        "distance_source": route["source"],
        "is_stale_price": is_stale_price(selected_fuel["last_updated"]),
        "_distance_km_raw": route["distance_km"],
        "_trip_cost_raw": trip_cost,
    }


def _strip_internal_fields(candidate: dict | None) -> dict | None:
    if candidate is None:
        return None
    return {
        key: value
        for key, value in candidate.items()
        if not key.startswith("_")
    }


def _find_station_fuel(station: dict, fuel_type: str) -> dict | None:
    for fuel in station["fuels"]:
        if fuel["fuel_type"] == fuel_type:
            return fuel
    return None
