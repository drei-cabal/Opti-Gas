# Enable postponed evaluation of type annotations.
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
