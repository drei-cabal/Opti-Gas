# Opti-Route Formula Specification

## Status

This document records the agreed direction for rebuilding the `Opti-Route` recommendation algorithm.

It is the canonical formula-design reference for:

- recommendation scoring
- preset weights
- reference-price logic
- normalization behavior
- future algorithm revisions

If the formula changes, this document must be updated in the same change set.

## Problem With The Current Formula

The current implementation uses a simplified trip-cost estimate:

```text
trip_cost = (driving_liters + liters_to_fill) * station_price
driving_liters = distance_km / default_km_per_liter
```

That approach is too coarse because it assumes:

- one fixed vehicle fuel economy for all users
- one fixed amount to buy for all users
- the fuel burned to reach the station should be valued using the destination station's price
- route optimization is only an economic calculation and not also a time and convenience problem

## Design Goal

`Opti-Route` should not only find:

- the cheapest fuel price
- the shortest drive

It should rank stations using a multi-factor score that balances:

- economic cost
- travel time
- travel distance

Lower score is better.

## Candidate Set

All scoring is performed only against the current filtered candidate set.

That means:

1. filter stations by brand, fuel type, and radius
2. compute route and pricing metrics only for those candidates
3. normalize only within that filtered set
4. score only within that filtered set

This is intentional. A station should be compared against the stations the user can realistically choose right now, not against every station citywide.

## Preset Weights

The score uses fixed preset weight tables, selected by the user.

Initial preset table:

```python
PRESETS = {
    "opti-route": {"cost": 0.50, "time": 0.30, "distance": 0.20},
    "save-money": {"cost": 0.70, "time": 0.20, "distance": 0.10},
    "save-time": {"cost": 0.10, "time": 0.60, "distance": 0.30},
    "balanced": {"cost": 0.34, "time": 0.33, "distance": 0.33},
}
```

These presets are fixed in the backend and selected by the user. They are not manually tuned with sliders in v1.

The legacy single-metric modes:

- `shortest`
- `cheapest`

should be replaced by preset-based ranking only.

Recommended stable slugs:

- `opti-route`
- `save-money`
- `save-time`
- `balanced`

UI labels may remain user-friendly, but the API should transmit stable slugs.

Why presets instead of manual sliders:

- easier to explain
- easier to test
- easier to keep consistent across sessions
- avoids fake precision from arbitrary user-entered weights

## Raw Metrics

For each candidate station `S`, the algorithm should compute:

### 1. Travel Distance

```text
distance_km(S)
```

Source:

- ORS route distance when available
- fallback estimator when ORS is unavailable

### 2. Travel Time

```text
time_min(S)
```

Source:

- ORS route duration when available
- fallback estimator when ORS is unavailable

### 3. Economic Cost

Economic cost should represent the economic burden of choosing station `S`.

```text
economic_cost(S) = travel_fuel_cost(S) + purchase_cost(S)
```

Where:

```text
purchase_cost(S) = liters_to_buy * station_price(S)
travel_liters(S) = distance_km(S) / vehicle_km_per_liter
travel_fuel_cost(S) = travel_liters(S) * reference_price(fuel_type)
```

Important:

- `station_price(S)` is the selected fuel's price at station `S`
- `reference_price(fuel_type)` is not the destination station's price
- travel fuel is modeled as one-way only for v1

## Vehicle And Purchase Inputs

Trip inputs should come from the saved active vehicle in `Garage`, not from hidden constants and not from always-on manual sliders in the filter sheet.

Product interaction details for this flow live in `docs/map-garage-product-spec.md`.

The active vehicle should provide:

- `fuel_type`
- `km_per_liter`
- `tank_capacity_l`

The Map should allow a per-trip tank-status override using:

```python
TANK_STATUS_PRESETS = {
    "empty": 0.90,
    "half": 0.50,
    "topping_up": 0.25,
}
```

Derived quantity:

```text
liters_to_buy = tank_capacity_l * refill_fraction
```

For the current demo implementation:

- an active vehicle is required for cost-based presets
- `Save Time` can still run without an active vehicle
- the Map uses the active vehicle's saved values plus the current tank-status selection
- tank status is not stored in the saved vehicle profile

Vehicle presets should remain preset-first and editable inside `Garage`, using family and subtype defaults rather than raw values first.

## Reference Price Logic

Travel fuel burned before reaching station `S` should be valued using a reference price, not the destination station's price.

Recommended fallback chain:

### First Choice

Use the average price of the selected fuel type among the current filtered candidate set:

```text
reference_price(fuel_type) =
    average(candidate_station_prices_for_fuel_type)
```

Only use this candidate-set average when at least `3` candidate stations remain for the selected fuel type.

### Second Choice

If the filtered candidate set is too small or missing enough data, use the citywide average from the project's own station data:

```text
citywide_average_for_fuel_type =
    mean(price of selected fuel type across all stations in stations.json)
```

This value comes from the project's maintained station dataset, not from an external API.

Both the candidate-set average and citywide average use a simple arithmetic mean.

### If Dataset-Derived Averages Cannot Be Computed

Do not fabricate a hardcoded fallback constant for the demo version.

If neither:

- candidate-average
- citywide-average

can be computed from the maintained station dataset, then the recommendation request should fail explicitly instead of inventing a reference price.

Recommended failure behavior:

- `best = null`
- `candidates = []`
- `candidate_count = 0`
- `scoring_mode = "no-option"`
- return an explicit reason such as:
  - `Unable to compute reference price for selected fuel type from station data`

## Normalization

The three metrics use different units:

- pesos
- minutes
- kilometers

They cannot be added directly.

Each metric must first be normalized within the current filtered candidate set:

```text
norm_cost(S) =
    (economic_cost(S) - min_economic_cost) / (max_economic_cost - min_economic_cost)

norm_time(S) =
    (time_min(S) - min_time) / (max_time - min_time)

norm_distance(S) =
    (distance_km(S) - min_distance) / (max_distance - min_distance)
```

Interpretation:

- `0` = best candidate on that metric
- `1` = worst candidate on that metric

### Degenerate Case

If all candidates have the same value for a metric:

```text
max_x == min_x
```

then the normalized value for that metric should be `0` for all candidates to avoid division by zero and avoid inventing a difference that does not exist.

## Final Score

For a preset `P`, the station score is:

```text
score_P(S) =
    w_cost(P) * norm_cost(S) +
    w_time(P) * norm_time(S) +
    w_distance(P) * norm_distance(S)
```

The recommended station is:

```text
best_station = argmin(score_P(S))
```

Lower score is better.

### Tie-Break Order

If two candidates have the same final score, rank by:

```text
score
→ economic_cost
→ distance
→ time
→ price
→ station_id
```

## Why Time And Distance Stay In The Score

Even though `economic_cost` already includes travel fuel burn, the algorithm still keeps:

- time
- distance

as separate metrics because they measure different user burdens:

- `economic_cost`: fuel spending burden
- `time`: convenience burden
- `distance`: detour burden

These metrics are related, but not redundant.

The selected station fuel price should influence the main score only through `economic_cost`, not as a separate weighted score component.

## Scoring Precision

The algorithm must use raw internal values for scoring and round only for display.

Use raw values for:

- travel liters
- economic cost
- normalization
- final score

Use rounded values only for:

- UI display
- human-readable summaries

Rounding must never decide the winner.

## Explainability Outputs

The backend should return the scoring breakdown for every candidate, even if the UI initially hides most of it.

At minimum, each candidate should expose:

- `economic_cost`
- `reference_price_used`
- `travel_liters`
- `purchase_cost`
- `norm_cost`
- `norm_distance`
- `norm_time`
- `preset_used`
- `final_score`

This keeps Opti-Route testable and explainable.

The API should also return:

- `reference_price_used`
- `reference_price_source`

Where `reference_price_source` is one of:

- `candidate-average`
- `citywide-average`

For the demo version, `preset_used` is required in the API response. Returning resolved `weights_used` is optional and may be omitted for response simplicity.

## Filters

The following are hard filters applied before scoring:

- selected brand
- selected fuel type
- selected radius

Implications:

- stations outside radius are excluded completely
- stations outside the selected brand are excluded completely
- stations that do not carry the selected fuel type are excluded completely
- the selected fuel record is the only valid source for `station_price(S)`

## Zero-Result Behavior

If filtering leaves zero candidate stations:

- return no recommendation
- return an empty candidate list
- explain the likely reason
- suggest recovery actions such as expanding radius, clearing brand, or switching fuel type

The system must not secretly relax filters or auto-expand the radius.

## Candidate-Set Context

The API should expose candidate-set context so the frontend can present edge cases honestly.

Suggested fields:

- `candidate_count`
- `scoring_mode`

Recommended values for `scoring_mode`:

- `comparative` for `>= 2` candidates
- `single-option` for `1` candidate
- `no-option` for `0` candidates

If only one candidate remains:

- return that station as the only valid option
- keep raw cost, time, and distance values for display
- do not pretend the station won through meaningful comparative scoring
- explanation should reflect that it is the only valid match in the current filter set

If exactly two candidates remain:

- keep the normal scoring pipeline
- allow the threshold-based explanation rules to avoid overstating tiny differences

## Demo Response Contract

Recommended minimum top-level response fields:

- `best`
- `candidates`
- `candidate_count`
- `scoring_mode`
- `preset_used`
- `reference_price_source`
- `reference_price_used`
- `fallback_warning`

Recommended minimum candidate-level response fields:

- `station_id`
- `name`
- `brand`
- `lat`
- `lng`
- `fuel_type`
- `price`
- `distance_km`
- `duration_min`
- `economic_cost`
- `final_score`
- `distance_source`
- `primary_reason`
- `secondary_reasons`

The backend should still compute intermediate fields such as:

- `travel_liters`
- `purchase_cost`
- `travel_fuel_cost`
- `norm_cost`
- `norm_time`
- `norm_distance`

even if the demo response does not expose them all.

## Routing Fallback Behavior

If ORS fails:

- still compute scores using fallback-estimated route values
- return a visible indicator that route values are estimated
- do not silently treat fallback values as if they were fully trusted ORS values

## Demo Scope

For the demo version:

- stale pricing is not part of scoring
- `last_updated` remains in the data model
- future stale-price logic may be added later, but it is intentionally excluded from the current score
- citywide averages are recomputed from `stations.json` on every recommendation request
- no hardcoded emergency reference-price constants are used

## Score Interpretation

The final Opti-Route score is only a relative ranking value within the current filtered candidate set.

It must not be presented as an absolute quality score.

Implications:

- the same station can receive a different score when filters change
- the score is useful for ranking and debugging
- user-facing explanations should describe tradeoffs, not quote the score as if it were a universal rating

## Explanation Strategy

Explanation must be rule-based, post-scoring, and separate from ranking.

Rules:

- explanation never changes the score
- explanation is generated after ranking
- explanation should compare the winner against the full candidate set, not only the runner-up
- every candidate should have explanation-ready metadata, even if the UI initially shows only the winner

Recommended structure:

- one primary explanation label
- optional secondary supporting notes

Primary labels should be assigned only when the winner has a clear enough advantage on a metric. Otherwise, use the fallback:

```text
Best overall balance
```

Recommended dominance thresholds versus the next-best candidate on that metric:

- `economic_cost`: at least `5%` better
- `distance`: at least `10%` shorter
- `time`: at least `10%` faster

If no metric clears its threshold:

- use `Best overall balance`

The UI should communicate tradeoffs rather than raw score values. Examples:

- `Best overall value for this filter set`
- `Faster and closer, with competitive total cost`
- `Best balance of cost, distance, and time`

## Scoring Pipeline

Opti-Route should use a staged pipeline rather than a one-pass score computation.

Recommended sequence:

```text
1. Hard-filter stations by brand, fuel type, and radius
2. Route the remaining stations
3. Keep only valid scored candidates
4. Compute reference_price_used from the valid scored set
5. Compute travel_liters, purchase_cost, travel_fuel_cost, and economic_cost
6. Normalize cost, time, and distance
7. Apply preset weights
8. Rank candidates
9. Assign explanation fields
```

The candidate-set average for `reference_price` must be computed from the final valid scored set, not merely from stations that survived the early filters.

## Expected Algorithm Flow

```text
1. Load all stations
2. Filter by brand, fuel type, and radius
3. Route each candidate and compute distance/time
4. Compute reference price for the selected fuel type
5. Compute travel_liters, purchase_cost, travel_fuel_cost, and economic_cost
6. Normalize cost, time, and distance across the filtered set
7. Apply preset weights
8. Rank candidates by final score
9. Return lowest-score station as best result
```

## Implementation Notes

When this design is implemented, the code should expose:

- raw route distance
- raw route duration
- selected station price
- reference price used
- economic cost
- normalized cost
- normalized time
- normalized distance
- preset name
- final score

This makes the result explainable and testable.

## Documentation Rule

All future changes to:

- formulas
- presets
- reference-price logic
- normalization logic
- candidate-selection logic

must update this document in the same task.
