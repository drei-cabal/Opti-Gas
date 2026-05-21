from __future__ import annotations


# Round public route distance to two decimal kilometers while raw ranking keeps full precision.
def round_distance(distance_km: float) -> float:
    return max(0.01, round(distance_km, 2))


# Round displayed trip duration into the compact minute value shown in the UI.
def round_duration(duration_min: float) -> float:
    return max(1, round(duration_min))


# Round economic cost into the coarse display bucket used in the recommendation UI.
def round_economic_cost(economic_cost: float) -> int:
    return int(round(economic_cost / 10.0) * 10)
