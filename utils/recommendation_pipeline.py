from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from utils.filters import filter_by_brand, filter_by_radius
from utils.scoring import (
    PRIMARY_REASON_SINGLE,
    build_sort_key,
    calculate_economic_cost,
    calculate_reference_price,
    compute_final_score,
    describe_candidates,
    normalize_metric,
    round_distance,
    round_duration,
    round_economic_cost,
)
from utils.station_store import get_station_id

MAX_ROUTE_WORKERS = 6

RouteGetter = Callable[[tuple[float, float], dict, str | None], dict]


def recommend_stations_result(
    *,
    stations: list[dict],
    origin: tuple[float, float],
    preset: str,
    brand: str,
    fuel_type: str,
    radius_km: float,
    route_getter: RouteGetter,
    ors_api_key: str | None,
    km_per_liter: float,
    liters_to_fill: float,
) -> dict:
    filtered = _filter_candidate_stations(stations, origin, brand, radius_km)
    routed_candidates = _build_routed_candidates(
        filtered,
        origin,
        fuel_type,
        route_getter,
        ors_api_key,
    )
    fallback_warning = any(
        candidate["distance_source"] == "haversine" for candidate in routed_candidates
    )

    if not routed_candidates:
        return _empty_result(
            preset=preset,
            fallback_warning=fallback_warning,
            reason="No stations match the current filters.",
        )

    reference_price, reference_price_source = calculate_reference_price(
        routed_candidates,
        stations,
        fuel_type,
    )
    if reference_price is None or reference_price_source is None:
        return _empty_result(
            preset=preset,
            fallback_warning=fallback_warning,
            reason="Unable to compute reference price for selected fuel type from station data.",
        )

    scored_candidates = _score_candidates(
        routed_candidates,
        preset=preset,
        reference_price=reference_price,
        reference_price_source=reference_price_source,
        km_per_liter=km_per_liter,
        liters_to_fill=liters_to_fill,
    )

    scoring_mode = "single-option" if len(scored_candidates) == 1 else "comparative"
    describe_candidates(scored_candidates, preset, scoring_mode)
    scored_candidates.sort(key=build_sort_key)
    best = scored_candidates[0]

    public_candidates = [_strip_internal_fields(candidate) for candidate in scored_candidates]
    return {
        "best": _strip_internal_fields(best),
        "candidates": public_candidates,
        "candidate_count": len(public_candidates),
        "scoring_mode": scoring_mode,
        "preset_used": preset,
        "reference_price_source": reference_price_source,
        "reference_price_used": round(reference_price, 2),
        "fallback_warning": fallback_warning,
    }


def _filter_candidate_stations(
    stations: list[dict],
    origin: tuple[float, float],
    brand: str,
    radius_km: float,
) -> list[dict]:
    filtered = filter_by_brand(stations, brand)
    return filter_by_radius(filtered, origin, radius_km)


def _build_routed_candidates(
    stations: list[dict],
    origin: tuple[float, float],
    fuel_type: str,
    route_getter: RouteGetter,
    ors_api_key: str | None,
) -> list[dict]:
    if len(stations) <= 1:
        candidate = (
            _build_routed_candidate(
                stations[0],
                origin,
                fuel_type,
                route_getter,
                ors_api_key,
            )
            if stations
            else None
        )
        return [candidate] if candidate else []

    max_workers = min(MAX_ROUTE_WORKERS, len(stations))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        built_candidates = list(
            executor.map(
                lambda station: _build_routed_candidate(
                    station,
                    origin,
                    fuel_type,
                    route_getter,
                    ors_api_key,
                ),
                stations,
            )
        )
    return [candidate for candidate in built_candidates if candidate is not None]


def _build_routed_candidate(
    station: dict,
    origin: tuple[float, float],
    fuel_type: str,
    route_getter: RouteGetter,
    ors_api_key: str | None,
) -> dict | None:
    selected_fuel = _find_station_fuel(station, fuel_type)
    if selected_fuel is None:
        return None

    route = route_getter(origin, station, ors_api_key=ors_api_key)
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
        "distance_source": route["source"],
        "_distance_km_raw": route["distance_km"],
        "_duration_min_raw": route["duration_min"],
    }


def _score_candidates(
    routed_candidates: list[dict],
    *,
    preset: str,
    reference_price: float,
    reference_price_source: str,
    km_per_liter: float,
    liters_to_fill: float,
) -> list[dict]:
    for candidate in routed_candidates:
        economics = calculate_economic_cost(
            distance_km=candidate["_distance_km_raw"],
            km_per_liter=km_per_liter,
            liters_to_fill=liters_to_fill,
            station_price=candidate["price"],
            reference_price=reference_price,
        )
        candidate.update(economics)
        candidate["preset_used"] = preset
        candidate["reference_price_used"] = round(reference_price, 2)
        candidate["reference_price_source"] = reference_price_source

    if len(routed_candidates) == 1:
        candidate = routed_candidates[0]
        candidate["norm_cost"] = 0.0
        candidate["norm_time"] = 0.0
        candidate["norm_distance"] = 0.0
        candidate["final_score"] = None
        candidate["primary_reason"] = PRIMARY_REASON_SINGLE
        candidate["secondary_reasons"] = ["Only matching station in the current filter set."]
        return routed_candidates

    cost_norms = normalize_metric([candidate["economic_cost"] for candidate in routed_candidates])
    time_norms = normalize_metric([candidate["_duration_min_raw"] for candidate in routed_candidates])
    distance_norms = normalize_metric(
        [candidate["_distance_km_raw"] for candidate in routed_candidates]
    )

    for index, candidate in enumerate(routed_candidates):
        candidate["norm_cost"] = cost_norms[index]
        candidate["norm_time"] = time_norms[index]
        candidate["norm_distance"] = distance_norms[index]
        candidate["final_score"] = round(compute_final_score(candidate, preset), 4)

    return routed_candidates


def _strip_internal_fields(candidate: dict | None) -> dict | None:
    if candidate is None:
        return None
    return {
        "station_id": candidate["station_id"],
        "name": candidate["name"],
        "brand": candidate["brand"],
        "lat": candidate["lat"],
        "lng": candidate["lng"],
        "fuel_type": candidate["fuel_type"],
        "price": candidate["price"],
        "available_fuel_types": candidate["available_fuel_types"],
        "distance_km": candidate["distance_km"],
        "duration_min": candidate["duration_min"],
        "economic_cost": round_economic_cost(candidate["economic_cost"]),
        "trip_cost": round_economic_cost(candidate["economic_cost"]),
        "travel_liters": round(candidate["travel_liters"], 3),
        "purchase_cost": round(candidate["purchase_cost"], 2),
        "travel_fuel_cost": round(candidate["travel_fuel_cost"], 2),
        "norm_cost": candidate["norm_cost"],
        "norm_time": candidate["norm_time"],
        "norm_distance": candidate["norm_distance"],
        "final_score": candidate["final_score"],
        "distance_source": candidate["distance_source"],
        "preset_used": candidate["preset_used"],
        "reference_price_used": candidate["reference_price_used"],
        "reference_price_source": candidate["reference_price_source"],
        "primary_reason": candidate["primary_reason"],
        "secondary_reasons": candidate["secondary_reasons"],
        "last_updated": candidate["last_updated"],
    }


def _empty_result(*, preset: str, fallback_warning: bool, reason: str) -> dict:
    return {
        "best": None,
        "candidates": [],
        "candidate_count": 0,
        "scoring_mode": "no-option",
        "preset_used": preset,
        "reference_price_source": None,
        "reference_price_used": None,
        "fallback_warning": fallback_warning,
        "reason": reason,
    }


def _find_station_fuel(station: dict, fuel_type: str) -> dict | None:
    for fuel in station["fuels"]:
        if fuel["fuel_type"] == fuel_type:
            return fuel
    return None
