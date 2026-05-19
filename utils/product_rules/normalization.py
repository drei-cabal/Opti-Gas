from __future__ import annotations


# Normalize a metric list into comparable 0..1 values for weighted scoring.
def normalize_metric(values: list[float]) -> list[float]:
    if not values:
        return []
    lower = min(values)
    upper = max(values)
    if upper == lower:
        return [0.0 for _ in values]
    return [(value - lower) / (upper - lower) for value in values]

