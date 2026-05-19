from __future__ import annotations

from utils.product_rules.cost import calculate_economic_cost, calculate_reference_price
from utils.product_rules.display import (
    round_distance,
    round_duration,
    round_economic_cost,
)
from utils.product_rules.explanations import (
    PRIMARY_REASON_ALTERNATIVE,
    PRIMARY_REASON_BALANCED,
    PRIMARY_REASON_COST,
    PRIMARY_REASON_DISTANCE,
    PRIMARY_REASON_SINGLE,
    PRIMARY_REASON_TIME,
    describe_candidates,
)
from utils.product_rules.normalization import normalize_metric
from utils.product_rules.presets import (
    CANDIDATE_AVERAGE_MIN_COUNT,
    DEFAULT_KM_PER_LITER,
    DEFAULT_LITERS_TO_FILL,
    PRESET_WEIGHTS,
    RECOMMENDATION_PRESETS,
)
from utils.product_rules.ranking import build_sort_key, compute_final_score

__all__ = [
    "CANDIDATE_AVERAGE_MIN_COUNT",
    "DEFAULT_KM_PER_LITER",
    "DEFAULT_LITERS_TO_FILL",
    "PRESET_WEIGHTS",
    "PRIMARY_REASON_ALTERNATIVE",
    "PRIMARY_REASON_BALANCED",
    "PRIMARY_REASON_COST",
    "PRIMARY_REASON_DISTANCE",
    "PRIMARY_REASON_SINGLE",
    "PRIMARY_REASON_TIME",
    "RECOMMENDATION_PRESETS",
    "build_sort_key",
    "calculate_economic_cost",
    "calculate_reference_price",
    "compute_final_score",
    "describe_candidates",
    "normalize_metric",
    "round_distance",
    "round_duration",
    "round_economic_cost",
]
