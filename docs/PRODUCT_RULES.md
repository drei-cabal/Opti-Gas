# Product Rules

This project keeps formula support rules such as reference-price logic,
normalization, presets, display rounding, and explanation text in
`utils/recommendations/product_rules/`.
The main filtering and scoring algorithms live in `utils/recommendations/filters/`
so each one has a specific file name.

The goal is to keep product decisions separate from HTTP handling and response shaping. `utils/recommendations/engine/pipeline.py` still owns the full recommendation pipeline, but it calls product-rule modules for the actual calculations.

## Folder Map

| File | Owns |
| --- | --- |
| `utils/recommendations/filters/brand_filter.py` | Brand filter algorithm |
| `utils/recommendations/filters/fuel_filter.py` | Fuel filter algorithm |
| `utils/recommendations/filters/radius_filter.py` | Radius filter algorithm |
| `utils/recommendations/filters/scoring_filter.py` | Preset weighted scoring and tie-break algorithm |
| `utils/recommendations/product_rules/presets.py` | Recommendation modes, scoring weights, and default trip assumptions |
| `utils/recommendations/product_rules/cost.py` | Reference-price selection and expected fuel-spend formulas |
| `utils/recommendations/product_rules/normalization.py` | Metric normalization for weighted scoring |
| `utils/recommendations/product_rules/explanations.py` | Primary and secondary recommendation reason rules |
| `utils/recommendations/product_rules/display.py` | Public display values for distance, duration, and trip cost |

New backend code should import filtering and scoring algorithms from
`utils/recommendations/filters/`, formula helpers from
`utils/recommendations/product_rules/`, or the recommendation entrypoint from
`utils/recommendations/engine/recommender.py`.

## Recommendation Pipeline Usage

The recommendation pipeline uses the algorithms and product rules in this order:

1. Filter the station collection by brand and radius.
2. Build candidate station records for the selected fuel type.
3. Resolve route distance and duration through live providers or the fallback estimator.
4. Select a reference fuel price.
5. Calculate expected economic cost per candidate.
6. Normalize cost, time, and distance metrics.
7. Apply recommendation-mode weights.
8. Sort candidates and attach explanation text.
9. Shape the public API response.

## Main Formulas

Expected fuel spend:

```text
travel_liters = distance_km / km_per_liter
purchase_cost = liters_to_fill * station_price
travel_fuel_cost = travel_liters * reference_price
economic_cost = purchase_cost + travel_fuel_cost
```

Weighted recommendation score:

```text
final_score =
    weight_cost * normalized_cost +
    weight_time * normalized_time +
    weight_distance * normalized_distance
```

Lower scores rank better.

Ranking uses raw route distance from `_distance_km_raw`. The public
`distance_km` value is only for station-card display and is rounded to two
decimal kilometers, such as `1.02km` or `1.12km`.

## Recommendation Modes

| Mode | Cost | Time | Distance |
| --- | ---: | ---: | ---: |
| `opti-route` | 0.50 | 0.30 | 0.20 |
| `save-money` | 0.70 | 0.20 | 0.10 |
| `save-time` | 0.10 | 0.60 | 0.30 |
| `balanced` | 0.34 | 0.33 | 0.33 |

Change these weights only in `utils/recommendations/product_rules/presets.py`.

## Test Surface

Formula-level tests live in `tests/test_product_rules.py`.

Pipeline-level behavior is still covered through `tests/test_algorithms.py` and `tests/test_app.py`.
