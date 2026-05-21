from __future__ import annotations  # Enable postponed evaluation of type annotations.

from collections.abc import Callable  # Type the route provider callback accepted by the pipeline.
from concurrent.futures import ThreadPoolExecutor  # Resolve candidate routes concurrently.

from utils.data.station_store import get_station_id  # Build stable candidate station identifiers.
from utils.recommendations.product_rules.cost import (  # Calculate economic and reference prices.
    calculate_economic_cost,
    calculate_reference_price,
)
from utils.recommendations.product_rules.display import (  # Round public display values.
    round_distance,
    round_duration,
    round_economic_cost,
)
from utils.recommendations.product_rules.explanations import (
    describe_candidates,  # Attach recommendation reasons.
)
from utils.recommendations.product_rules.filters import (  # Filter candidate stations.
    filter_by_brand,
    filter_by_radius,
)
from utils.recommendations.product_rules.normalization import (
    normalize_metric,  # Normalize metrics for scoring.
)
from utils.recommendations.product_rules.ranking import (  # Rank candidates.
    build_sort_key,
    compute_final_score,
)

MAX_ROUTE_WORKERS = 6
PUBLIC_CANDIDATE_FIELDS = ("station_id", "name", "brand", "lat", "lng", "fuel_type", "price", "available_fuel_types", "distance_km", "duration_min", "norm_cost", "norm_time", "norm_distance", "final_score", "distance_source", "preset_used", "reference_price_used", "reference_price_source", "primary_reason", "secondary_reasons", "last_updated")

RouteGetter = Callable[[tuple[float, float], dict, str | None], dict]


# Run the full recommendation flow from filtering through scoring and response shaping.
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
    filtered = filter_by_brand(stations, brand)
    filtered = filter_by_radius(filtered, origin, radius_km)
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
        return _no_option_response(
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
        return _no_option_response(
            preset=preset,
            fallback_warning=fallback_warning,
            reason="Unable to compute reference price for selected fuel type from station data.",
        )

    rounded_reference_price = round(reference_price, 2)
    _apply_economics(
        routed_candidates,
        km_per_liter=km_per_liter,
        liters_to_fill=liters_to_fill,
        reference_price=reference_price,
        reference_price_source=reference_price_source,
        rounded_reference_price=rounded_reference_price,
        preset=preset,
    )
    scoring_mode = _apply_scores(routed_candidates, preset)
    describe_candidates(routed_candidates, preset, scoring_mode)
    routed_candidates.sort(key=build_sort_key)

    return _recommendation_response(
        routed_candidates,
        scoring_mode=scoring_mode,
        preset=preset,
        reference_price_source=reference_price_source,
        reference_price_used=rounded_reference_price,
        fallback_warning=fallback_warning,
    )


# Build the empty recommendation response for no-match or no-price cases.
def _no_option_response(*, preset: str, fallback_warning: bool, reason: str) -> dict:
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


# Attach economic cost and reference-price metadata to routed candidates.
def _apply_economics(
    candidates: list[dict],
    *,
    km_per_liter: float,
    liters_to_fill: float,
    reference_price: float,
    reference_price_source: str,
    rounded_reference_price: float,
    preset: str,
) -> None:
    for candidate in candidates:
        candidate.update(
            calculate_economic_cost(
                distance_km=candidate["_distance_km_raw"],
                km_per_liter=km_per_liter,
                liters_to_fill=liters_to_fill,
                station_price=candidate["price"],
                reference_price=reference_price,
            )
        )
        candidate["preset_used"] = preset
        candidate["reference_price_used"] = rounded_reference_price
        candidate["reference_price_source"] = reference_price_source


# Apply single-option or comparative scoring fields to candidates.
def _apply_scores(candidates: list[dict], preset: str) -> str:
    if len(candidates) == 1:
        candidate = candidates[0]
        candidate["norm_cost"] = 0.0
        candidate["norm_time"] = 0.0
        candidate["norm_distance"] = 0.0
        candidate["final_score"] = None
        return "single-option"

    cost_norms = normalize_metric([candidate["economic_cost"] for candidate in candidates])
    time_norms = normalize_metric([candidate["_duration_min_raw"] for candidate in candidates])
    distance_norms = normalize_metric([candidate["_distance_km_raw"] for candidate in candidates])

    for index, candidate in enumerate(candidates):
        candidate["norm_cost"] = cost_norms[index]
        candidate["norm_time"] = time_norms[index]
        candidate["norm_distance"] = distance_norms[index]
        candidate["final_score"] = round(compute_final_score(candidate, preset), 4)
    return "comparative"


# Build the final recommendation response after candidates are scored and sorted.
def _recommendation_response(
    routed_candidates: list[dict],
    *,
    scoring_mode: str,
    preset: str,
    reference_price_source: str,
    reference_price_used: float,
    fallback_warning: bool,
) -> dict:
    public_candidates = [_public_candidate(candidate) for candidate in routed_candidates]
    return {
        "best": public_candidates[0],
        "candidates": public_candidates,
        "candidate_count": len(public_candidates),
        "scoring_mode": scoring_mode,
        "preset_used": preset,
        "reference_price_source": reference_price_source,
        "reference_price_used": reference_price_used,
        "fallback_warning": fallback_warning,
    }


# Shape one internal candidate into the public API candidate payload.
def _public_candidate(candidate: dict) -> dict:
    rounded_cost = round_economic_cost(candidate["economic_cost"])
    return {
        key: candidate[key]
        for key in PUBLIC_CANDIDATE_FIELDS
    } | {
        "economic_cost": rounded_cost,
        "trip_cost": rounded_cost,
        "travel_liters": round(candidate["travel_liters"], 3),
        "purchase_cost": round(candidate["purchase_cost"], 2),
        "travel_fuel_cost": round(candidate["travel_fuel_cost"], 2),
    }


# Build candidate recommendation records with route data for all matching stations.
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


# Build one candidate record for a station and selected fuel type.
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


# Find the fuel entry on a station that matches the requested fuel type.
def _find_station_fuel(station: dict, fuel_type: str) -> dict | None:
    for fuel in station["fuels"]:
        if fuel["fuel_type"] == fuel_type:
            return fuel
    return None
