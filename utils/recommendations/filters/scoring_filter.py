from __future__ import annotations  # Enable postponed evaluation of type annotations.

from utils.recommendations.product_rules.presets import (  # Use preset scoring weights.
    PRESET_WEIGHTS,
)


# Compute the weighted final score for one candidate under the selected preset.
def compute_final_score(candidate: dict, preset: str) -> float:
    weights = PRESET_WEIGHTS[preset]
    return (
        weights["cost"] * candidate["norm_cost"]
        + weights["time"] * candidate["norm_time"]
        + weights["distance"] * candidate["norm_distance"]
    )


# Build the deterministic sort key used to rank recommendation candidates.
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
