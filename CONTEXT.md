# Opti-Gas Context

## Product

Opti-Gas is a mobile-first Flask plus Leaflet app for Tagum City drivers. It recommends a fuel station and opens navigation in Google Maps.

## Domain Terms

- **Station collection** - the full station dataset loaded from `data/stations/stations.json`.
- **Station record** - one physical station location with `name`, `brand`, coordinates, and `fuels`.
- **Fuel record** - one fuel entry inside a station, with `fuel_type`, `price`, and `last_updated`.
- **Station identity** - coordinate-based `station_id`, not station name.
- **Recommendation pipeline** - filter candidates, resolve routes, compute price-aware metrics, rank by recommendation mode, and shape the recommendation response.
- **Recommendation mode** - one of `opti-route`, `save-money`, `save-time`, or `balanced`.
- **Route provider** - ORS, OSRM, or the fallback route estimate.
- **Fallback route estimate** - local haversine-derived distance and duration heuristics used when external routing is unavailable.
- **Station price update flow** - the mutation path that validates and writes an updated fuel price back to station data.

## Important Seams

- `app.py` is the HTTP seam.
- `utils/recommendations/requests/parser.py` owns recommendation query normalization and defaults.
- `utils/recommendations/engine/pipeline.py` owns recommendation pipeline orchestration, scoring application, and API response shaping helpers.
- `utils/recommendations/product_rules/` owns recommendation mode weights, filter rules, cost formulas, normalization, ranking, display rounding, and explanation rules.
- `utils/routing/service.py` owns route provider selection and in-memory route cache behavior.
- `utils/geo/location.py` owns distance math and local fallback-estimation helpers.
- `utils/data/station_store.py` owns the public station data API: cached station and landmark loading, normalization, station identity, and atomic station price updates.
- `utils/data/models.py` owns Pydantic-backed station and fuel validation rules.
- `utils/data/cache.py` owns file-metadata cache helpers shared by station and landmark loading.
- `static/js/ui.js` is now the thin frontend entrypoint and composition seam.
- `static/js/features/` owns feature-local browser behavior such as the Garage, station collection presentation, filters, advisories, sheets, and directions handoff.
- `static/js/features/view.js` owns Map-vs-Garage visibility plus setup-prompt rendering.
- `static/js/shared/state.js` owns the centralized frontend state, element registry, and shared constants for the current behavior-preserving module split.
- Recommendation responses now include scoring breakdown fields such as travel cost, normalization values, and reference-price metadata so the algorithm can be explained directly from the API.
- The station loader still accepts legacy single-fuel records on input, but it strips that compatibility marker before caching or returning data.

## Current Architectural Direction

- Preserve the current API and UI behavior while deepening modules underneath.
- Prefer one real seam for recommendation pipeline policy instead of spreading ranking logic across HTTP parsing and helper functions.
- Keep trip-input policy aligned with the active vehicle plus current Map tank-status selection.
