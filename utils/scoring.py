from __future__ import annotations

PRESET_WEIGHTS = {
    "opti-route": {"cost": 0.50, "time": 0.30, "distance": 0.20},
    "save-money": {"cost": 0.70, "time": 0.20, "distance": 0.10},
    "save-time": {"cost": 0.10, "time": 0.60, "distance": 0.30},
    "balanced": {"cost": 0.34, "time": 0.33, "distance": 0.33},
}

DEFAULT_KM_PER_LITER = 14.0
DEFAULT_LITERS_TO_FILL = 20.0
CANDIDATE_AVERAGE_MIN_COUNT = 3
RECOMMENDATION_PRESETS = set(PRESET_WEIGHTS)

PRIMARY_REASON_BALANCED = "Best overall balance"
PRIMARY_REASON_COST = "Lowest total fuel cost"
PRIMARY_REASON_DISTANCE = "Shortest detour"
PRIMARY_REASON_TIME = "Fastest option"
PRIMARY_REASON_SINGLE = "Only matching station"
PRIMARY_REASON_ALTERNATIVE = "Alternative option"

COST_MARGIN_THRESHOLD = 0.05
DISTANCE_MARGIN_THRESHOLD = 0.10
TIME_MARGIN_THRESHOLD = 0.10


def calculate_economic_cost(
    *,
    distance_km: float,
    km_per_liter: float,
    liters_to_fill: float,
    station_price: float,
    reference_price: float,
) -> dict:
    travel_liters = distance_km / km_per_liter
    purchase_cost = liters_to_fill * station_price
    travel_fuel_cost = travel_liters * reference_price
    economic_cost = purchase_cost + travel_fuel_cost
    return {
        "travel_liters": travel_liters,
        "purchase_cost": purchase_cost,
        "travel_fuel_cost": travel_fuel_cost,
        "economic_cost": economic_cost,
    }


def calculate_reference_price(
    candidates: list[dict],
    all_stations: list[dict],
    fuel_type: str,
) -> tuple[float | None, str | None]:
    candidate_prices = sorted(
        candidate["price"]
        for candidate in candidates
        if candidate["fuel_type"] == fuel_type
    )
    if len(candidate_prices) >= CANDIDATE_AVERAGE_MIN_COUNT:
        return sum(candidate_prices) / len(candidate_prices), "candidate-average"

    citywide_prices = sorted(
        fuel["price"]
        for station in all_stations
        for fuel in station["fuels"]
        if fuel["fuel_type"] == fuel_type
    )
    if citywide_prices:
        return sum(citywide_prices) / len(citywide_prices), "citywide-average"

    return None, None


def normalize_metric(values: list[float]) -> list[float]:
    if not values:
        return []
    lower = min(values)
    upper = max(values)
    if upper == lower:
        return [0.0 for _ in values]
    return [(value - lower) / (upper - lower) for value in values]


def compute_final_score(candidate: dict, preset: str) -> float:
    weights = PRESET_WEIGHTS[preset]
    return (
        weights["cost"] * candidate["norm_cost"]
        + weights["time"] * candidate["norm_time"]
        + weights["distance"] * candidate["norm_distance"]
    )


def build_sort_key(candidate: dict) -> tuple:
    final_score = candidate["final_score"]
    if final_score is None:
        final_score = float("inf")
    return (
        final_score,
        candidate["economic_cost"],
        candidate["_distance_km_raw"],
        candidate["_duration_min_raw"],
        candidate["price"],
        candidate["station_id"],
    )


def describe_candidates(candidates: list[dict], preset: str, scoring_mode: str) -> None:
    if not candidates:
        return

    if scoring_mode == "single-option":
        candidate = candidates[0]
        candidate["primary_reason"] = PRIMARY_REASON_SINGLE
        candidate["secondary_reasons"] = [
            "Only matching station in the current filter set.",
            _preset_supporting_note(preset),
        ]
        return

    cost_order = sorted(candidates, key=lambda candidate: candidate["economic_cost"])
    distance_order = sorted(candidates, key=lambda candidate: candidate["_distance_km_raw"])
    time_order = sorted(candidates, key=lambda candidate: candidate["_duration_min_raw"])

    best = min(candidates, key=build_sort_key)
    for candidate in candidates:
        if candidate["station_id"] == best["station_id"]:
            candidate["primary_reason"] = _primary_reason_for_winner(
                winner=candidate,
                cost_order=cost_order,
                distance_order=distance_order,
                time_order=time_order,
            )
            candidate["secondary_reasons"] = _secondary_reasons_for_winner(
                winner=candidate,
                preset=preset,
                cost_order=cost_order,
                distance_order=distance_order,
                time_order=time_order,
            )
        else:
            candidate["primary_reason"] = PRIMARY_REASON_ALTERNATIVE
            candidate["secondary_reasons"] = _secondary_reasons_for_alternative(
                candidate=candidate,
                best=best,
            )


def round_distance(distance_km: float) -> float:
    return max(0.1, round(distance_km))


def round_duration(duration_min: float) -> float:
    return max(1, round(duration_min))


def round_economic_cost(economic_cost: float) -> int:
    return int(round(economic_cost / 10.0) * 10)


def _primary_reason_for_winner(
    *,
    winner: dict,
    cost_order: list[dict],
    distance_order: list[dict],
    time_order: list[dict],
) -> str:
    if _has_clear_advantage(winner, cost_order, "economic_cost", COST_MARGIN_THRESHOLD):
        return PRIMARY_REASON_COST
    if _has_clear_advantage(winner, distance_order, "_distance_km_raw", DISTANCE_MARGIN_THRESHOLD):
        return PRIMARY_REASON_DISTANCE
    if _has_clear_advantage(winner, time_order, "_duration_min_raw", TIME_MARGIN_THRESHOLD):
        return PRIMARY_REASON_TIME
    return PRIMARY_REASON_BALANCED


def _secondary_reasons_for_winner(
    *,
    winner: dict,
    preset: str,
    cost_order: list[dict],
    distance_order: list[dict],
    time_order: list[dict],
) -> list[str]:
    notes: list[str] = []
    if winner["station_id"] == cost_order[0]["station_id"] and winner["primary_reason"] != PRIMARY_REASON_COST:
        notes.append("Lowest expected total fuel cost among current options.")
    if winner["station_id"] == distance_order[0]["station_id"] and winner["primary_reason"] != PRIMARY_REASON_DISTANCE:
        notes.append("Shortest drive among the current matches.")
    if winner["station_id"] == time_order[0]["station_id"] and winner["primary_reason"] != PRIMARY_REASON_TIME:
        notes.append("Fastest route among the current matches.")

    preset_note = _preset_supporting_note(preset)
    if preset_note not in notes:
        notes.append(preset_note)
    return notes[:2]


def _secondary_reasons_for_alternative(*, candidate: dict, best: dict) -> list[str]:
    notes = []
    if candidate["economic_cost"] > best["economic_cost"]:
        notes.append("Higher expected total fuel cost than the best option.")
    if candidate["_distance_km_raw"] > best["_distance_km_raw"]:
        notes.append("Longer detour than the best option.")
    elif candidate["_duration_min_raw"] > best["_duration_min_raw"]:
        notes.append("Slower route than the best option.")
    return notes[:2] or ["Valid option in the current filter set."]


def _preset_supporting_note(preset: str) -> str:
    if preset == "save-money":
        return "Prioritizes lower expected fuel spending."
    if preset == "save-time":
        return "Prioritizes faster arrival with competitive cost."
    if preset == "balanced":
        return "Balances cost, distance, and time evenly."
    return "Best overall tradeoff for this filter set."


def _has_clear_advantage(
    winner: dict,
    ordered_candidates: list[dict],
    field: str,
    threshold: float,
) -> bool:
    if not ordered_candidates or ordered_candidates[0]["station_id"] != winner["station_id"]:
        return False
    if len(ordered_candidates) < 2:
        return True
    next_best = ordered_candidates[1][field]
    winner_value = winner[field]
    if next_best <= 0:
        return False
    return (next_best - winner_value) / next_best >= threshold
