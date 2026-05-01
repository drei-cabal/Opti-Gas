# OPTI-GAS

OPTI-GAS is a mobile-first Flask + Leaflet web app for Tagum City drivers. It opens directly to a full-screen map, highlights the best-value fuel station, and hands off turn-by-turn navigation to Google Maps.

## Stack

- Backend: Flask
- Frontend: HTML, CSS, vanilla JavaScript, Leaflet.js
- Data: `data/stations/stations.json`
- Routing: OpenRouteService with Haversine fallback

## Quick Start

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python app.py
```

Open `http://127.0.0.1:5000`.

## Temporary Files

The project now routes most Python and pytest temporary files into `.tmp/` so generated clutter stays in one place.

Main folders:

- `.tmp/runtime`: Python temporary files
- `.tmp/pycache`: Python bytecode caches
- `.tmp/pytest`: pytest cache and temp runs

Cleanup:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cleanup.ps1
```

This is not automatic on shutdown. The folder is centralized so you can delete it safely after the app or tests stop running.

## Project Layout

- `app.py`: Flask entrypoint and API routes
- `utils/`: station loading, validation, filtering, routing, and recommendation logic
- `templates/index.html`: single-page shell
- `static/css/style.css`: full-screen map and overlay styles
- `static/js/`: map, API, and UI logic
- `scripts/validate_stations.py`: station data validation
- `scripts/update_prices.py`: CLI updater for station prices
- `tests/`: backend unit and integration tests

## Validation

```bash
python scripts/validate_stations.py
pytest
```

## Algorithms Used

This project is not only a Flask + Leaflet application. Its core behavior is driven by filtering, routing, ranking, and fallback-estimation algorithms that determine which fuel station should be recommended to the user.

For the current Opti-Route redesign specification, see `docs/opti-route-formula-spec.md`.

For the current Map + Garage product interaction, saved-vehicle behavior, and first-run gating rules, see `docs/map-garage-product-spec.md`.

For repo-local UI design engineering guidance used for this mobile map experience, see `skills/opti-gas-ui-design-engineering/SKILL.md`.

## Current UI Notes

The current frontend direction is:

- map-first mobile layout
- dark chrome for search, advisory, prompts, and bottom navigation
- muted cool blue-gray surfaces for sheets, cards, filters, and Garage
- white reserved for highest-elevation surfaces such as modals
- amber reserved for recommendation and active-state emphasis

Current map behavior notes:

- the app requests the user's current browser geolocation on load
- there is no landmark picker in the current product scope
- the collapsed station sheet defaults to a compact recommendation summary
- tank status lives only in the Map filter flow, not in the saved vehicle model

### 1. Candidate Filtering

The system first reduces the full station dataset into a smaller candidate set.

Filtering steps:

1. Filter by selected brand
2. Filter by selected fuel type availability
3. Filter by radius from the user's origin

Relevant files:

- `utils/filters.py`
- `utils/algorithms.py`

Pseudocode:

```text
candidate_stations = all_stations
candidate_stations = filter_by_brand(candidate_stations, selected_brand)
candidate_stations = filter_by_radius(candidate_stations, user_location, radius_km)
candidate_stations = keep_only_stations_with_requested_fuel(candidate_stations, fuel_type)
```

Time complexity:

- Brand filtering: `O(n)`
- Radius filtering: `O(n)`
- Fuel-type availability check: `O(n * f)`, where `f` is the number of fuel records per station
- Overall filtering phase: `O(n)` in practice, since `f` is a small constant

### 2. Route Distance and Travel Time Computation

For each remaining candidate station, the system computes distance and estimated travel time using this priority order:

1. OpenRouteService (ORS)
2. OSRM public road routing
3. Local fallback estimate using adjusted road distance and urban-speed heuristics

Relevant files:

- `utils/routing.py`
- `utils/location.py`

This design is a fallback algorithm strategy:

- use the most accurate road-network result first
- degrade gracefully if an external routing provider is unavailable

Pseudocode:

```text
for each station in candidate_stations:
    if ORS is available:
        route = get_ors_route(origin, station)
    else if OSRM is available:
        route = get_osrm_route(origin, station)
    else:
        route = estimate_route_from_haversine(origin, station)
```

Time complexity:

- Local computation per station: `O(1)`
- Full route-evaluation loop: `O(k)` for `k` candidate stations
- External API latency dominates real runtime, but the local algorithmic pass is linear

### 3. Recommendation / Ranking Algorithm

After computing route and fuel data for every candidate station, the system ranks stations using preset-based weighted scoring:

- `opti-route`
- `save-money`
- `save-time`
- `balanced`

The current formula uses:

```text
economic_cost = travel_fuel_cost + purchase_cost
travel_fuel_cost = (distance_km / km_per_liter) * reference_price
purchase_cost = liters_to_buy * station_price

final_score =
    w_cost * norm_cost +
    w_time * norm_time +
    w_distance * norm_distance
```

Trip assumptions are now sourced from the active saved vehicle in `Garage` plus the current Map tank-status override, rather than from always-visible manual sliders.

Relevant file:

- `utils/algorithms.py`

Pseudocode:

```text
for each station in candidate_stations:
    compute distance
    compute duration
    compute trip_cost

sort candidate_stations based on selected_mode
best_station = candidate_stations[0]
```

Time complexity:

- Candidate evaluation: `O(k)`
- Sorting: `O(k log k)`
- Final recommendation phase: `O(k log k)`

### 4. Duplicate-Name Resolution Strategy

Some stations may share the same name but represent different physical locations. To avoid collisions in the UI and update flow, the system uses a coordinate-based `station_id`.

Relevant files:

- `utils/station_store.py`
- `utils/algorithms.py`
- `static/js/ui.js`

This is an identity-resolution algorithm based on location rather than name alone.

### 5. Fallback Estimation Heuristic

When road-routing data is unavailable, the system does not use raw straight-line distance directly. Instead, it:

1. computes haversine distance
2. applies a road-distance multiplier
3. estimates travel time using short-distance urban speed bands plus fixed delay

This improves the fallback estimate compared with naive straight-line travel time.

Time complexity:

- Haversine distance: `O(1)`
- Adjusted fallback estimate: `O(1)`

### Summary of Core Complexities

- Load + validate stations: `O(n)`
- Brand/radius/fuel filtering: `O(n)`
- Candidate route evaluation: `O(k)`
- Recommendation sorting: `O(k log k)`
- Overall recommendation pipeline: `O(n + k log k)`

Where:

- `n` = total number of stations
- `k` = number of stations remaining after filtering

### Why This Fits a Complexities and Algorithms Project

This project demonstrates:

- linear filtering algorithms
- heuristic fallback estimation
- multi-criteria ranking
- sorting-based decision making
- identity resolution for ambiguous duplicate station names
- practical tradeoffs between accuracy, performance, and system resilience

In other words, the web app is the interface, but the core system behavior is driven by algorithm selection, complexity tradeoffs, and structured decision logic.

## Demo Checklist

Before presenting, verify these items:

1. `pytest` runs with the project config in `pytest.ini`
2. `/api/recommend` returns the scoring breakdown fields needed to explain the algorithm
3. The recommendation flow is easy to describe as:
   - filter
   - route
   - normalize
   - weight
   - rank
4. The fallback route path is explained as a deliberate algorithm, not a bug
5. The station identity rule is explained as coordinate-based, not name-based
6. The response contract includes `candidate_count`, `scoring_mode`, `preset_used`, and `reference_price_source`

For the subject paper, the best comparison table is still:

1. `save-time`
2. `save-money`
3. `opti-route`

For each mode, record:

- route distance
- estimated travel time
- fuel price
- total economic cost
- final score

That gives you a clean way to discuss correctness, tradeoffs, and complexity without overselling the frontend.

## Seed From OSM

To pull Tagum fuel-station candidates from OpenStreetMap into a review file:

```bash
python scripts/seed_stations_from_osm.py
```

This writes `data/stations/stations.osm.seed.json` with:

- Tagum candidate stations from OSM
- one station record per location
- required fuels prefilled as `Unleaded 91`, `Premium 95`, and `Diesel`
- placeholder prices for manual cleanup

Review that file carefully before copying entries into `data/stations/stations.json`.

To rank suspicious seed entries for cleanup:

```bash
python scripts/audit_osm_seed.py
```

This writes `data/stations/stations.osm.audit.csv`, which flags:

- generated unnamed stations
- generic `Independent` brands
- likely duplicates by name
- nearby same-name or same-brand candidates
- placeholder prices

## Station Data Shape

Each station now stores one location with multiple fuel records in `data/stations/stations.json`. Every station must define exactly these three fuel types:

- `Unleaded 91`
- `Premium 95`
- `Diesel`

```json
{
  "name": "Petron Apokon",
  "brand": "Petron",
  "lat": 7.4523,
  "lng": 125.8142,
  "fuels": [
    {
      "fuel_type": "Unleaded 91",
      "price": 90.2,
      "last_updated": "2026-04-28"
    },
    {
      "fuel_type": "Diesel",
      "price": 88.4,
      "last_updated": "2026-04-28"
    },
    {
      "fuel_type": "Premium 95",
      "price": 94.6,
      "last_updated": "2026-04-28"
    }
  ]
}
```
