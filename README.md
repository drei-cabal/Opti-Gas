# OPTI-GAS

OPTI-GAS is a mobile-first Flask + Leaflet web app for Tagum City drivers. It opens directly to a full-screen map, highlights the best-value fuel station, and hands off turn-by-turn navigation to Google Maps.

## Stack

- Backend: Flask
- Frontend: HTML, CSS, vanilla JavaScript, Leaflet.js
- Data: `data/stations/stations.json`, `data/landmarks.json`
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

After computing route and fuel data for every candidate station, the system ranks stations according to the selected mode:

- `shortest`: minimize route distance
- `cheapest`: minimize fuel price
- `opti-route`: minimize estimated total trip cost

The `opti-route` mode uses:

```text
trip_cost = (driving_liters + liters_to_fill) * price_per_liter
driving_liters = route_distance_km / default_km_per_liter
```

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

## Next Step

The strongest next step for this project is to add a formal algorithm evaluation section and compare recommendation quality across modes.

Recommended implementation:

1. Prepare a fixed test set of sample user locations in Tagum City
2. Run the three recommendation modes:
   - `shortest`
   - `cheapest`
   - `opti-route`
3. Record for each result:
   - route distance
   - estimated travel time
   - fuel price
   - estimated total trip cost
4. Compare which mode performs best for different user priorities
5. Present the results as tables/charts in the project paper or demo

Why this is the best next step:

- it proves the algorithms are not only implemented, but also evaluated
- it gives a clear basis for discussing correctness and tradeoffs
- it directly supports a `Complexities and Algorithms` subject requirement

Possible follow-up after that:

- add weighted multi-criteria scoring instead of mode-based sorting only
- benchmark route-source accuracy between `ORS`, `OSRM`, and fallback estimation
- add coordinate-clustering dedupe helpers as another algorithmic feature

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
