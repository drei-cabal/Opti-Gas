from __future__ import annotations

from utils.product_rules.ranking import build_sort_key

PRIMARY_REASON_BALANCED = "Best overall balance"
PRIMARY_REASON_COST = "Lowest total fuel cost"
PRIMARY_REASON_DISTANCE = "Shortest detour"
PRIMARY_REASON_TIME = "Fastest option"
PRIMARY_REASON_SINGLE = "Only matching station"
PRIMARY_REASON_ALTERNATIVE = "Alternative option"

COST_MARGIN_THRESHOLD = 0.05
DISTANCE_MARGIN_THRESHOLD = 0.10
TIME_MARGIN_THRESHOLD = 0.10


# Attach user-facing primary and secondary reasons to each ranked candidate.
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


# Pick the strongest headline reason for why the winning station ranked first.
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


# Build supporting notes for the winning station based on its comparative advantages.
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


# Explain how a non-winning candidate compares against the best option.
def _secondary_reasons_for_alternative(*, candidate: dict, best: dict) -> list[str]:
    notes = []
    if candidate["economic_cost"] > best["economic_cost"]:
        notes.append("Higher expected total fuel cost than the best option.")
    if candidate["_distance_km_raw"] > best["_distance_km_raw"]:
        notes.append("Longer detour than the best option.")
    elif candidate["_duration_min_raw"] > best["_duration_min_raw"]:
        notes.append("Slower route than the best option.")
    return notes[:2] or ["Valid option in the current filter set."]


# Return the preset-specific note used in recommendation explanations.
def _preset_supporting_note(preset: str) -> str:
    if preset == "save-money":
        return "Prioritizes lower expected fuel spending."
    if preset == "save-time":
        return "Prioritizes faster arrival with competitive cost."
    if preset == "balanced":
        return "Balances cost, distance, and time evenly."
    return "Best overall tradeoff for this filter set."


# Check whether the winner has a meaningful lead over the next-best candidate on one metric.
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

