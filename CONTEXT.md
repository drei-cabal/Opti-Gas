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
- **Route provider** - ORS or OSRM.
- **Route unavailable** - the explicit no-option state returned when no live route can be resolved for the current candidates.
- **Station price update flow** - the mutation path that validates and writes an updated fuel price back to station data.

## Important Seams

- `app.py` is the HTTP seam.
- `utils/recommendations/requests/parser.py` owns recommendation query normalization and defaults.
- `utils/recommendations/engine/pipeline.py` owns recommendation pipeline orchestration, scoring application, and API response shaping helpers.
- `utils/recommendations/filters/` owns brand, fuel, radius, and scoring filters used by the recommendation pipeline.
- `utils/recommendations/product_rules/` owns recommendation mode weights, cost formulas, normalization, display rounding, and explanation rules.
- `utils/recommendations/engine/recommender.py` owns the public `recommend_stations(...)` entrypoint.
- `utils/routing/service.py` owns route provider orchestration.
- `utils/routing/providers.py` owns ORS and OSRM provider calls.
- `utils/routing/cache.py` owns in-memory route cache behavior.
- `utils/geo/distance.py` owns straight-line distance math.
- `utils/data/station_store.py` owns the public station data API: cached station and landmark loading, normalization, station identity, and atomic station price updates.
- `utils/data/models.py` owns Pydantic-backed station and fuel validation rules.
- `utils/data/cache.py` owns file-metadata cache helpers shared by station and landmark loading.
- `static/js/ui.js` is now the thin frontend entrypoint and composition seam.
- `static/js/features/` owns feature-local browser behavior such as the Garage, station collection presentation, filters, advisories, sheets, and directions handoff.
- `static/js/features/station-search.js` owns browser-side station lookup, Fuse.js search ranking, display-station shaping, and cached-station rebinding.
- `static/js/features/station-summary.js` owns the selected/recommended station summary text shown in the app shell.
- `static/js/features/price-updates.js` owns station price update flow behavior in the browser.
- `static/js/features/garage-policy.js` owns active vehicle lookup, trip-input derivation, and recommendation-mode lock policy.
- `static/js/features/location.js` owns GPS watch lifecycle, location-failure handling, and refresh-distance policy.
- `static/js/features/recommendations.js` owns browser recommendation refresh, request assembly, cached recommendation updates, and map marker refresh after API responses.
- `static/js/features/view.js` owns Map-vs-Garage visibility plus setup-prompt rendering.
- `static/js/shared/state.js` owns the centralized frontend state, element registry, and shared constants for the current behavior-preserving module split.
- Recommendation responses now include scoring breakdown fields such as travel cost, normalization values, and reference-price metadata so the algorithm can be explained directly from the API.
- The station loader still accepts legacy single-fuel records on input, but it strips that compatibility marker before caching or returning data.

## Current Architectural Direction

- Preserve the current API and UI behavior while deepening modules underneath.
- Prefer one real seam for recommendation pipeline policy instead of spreading ranking logic across HTTP parsing and helper functions.
- Keep trip-input policy aligned with the active vehicle plus current Map tank-status selection.
