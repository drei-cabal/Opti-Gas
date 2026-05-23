# Algorithms Used In Opti-Gas

This document lists the main project-specific algorithms and third-party algorithm libraries used by the project.

## Project-Specific Algorithms

| Algorithm | Used For | Project Usage |
| --- | --- | --- |
| Brand filter | Limiting recommendations to the selected fuel brand. | Implemented in `utils/recommendations/filters/brand_filter.py`. If the user chooses `any`, all brands stay available. Otherwise, Opti-Gas keeps only stations whose brand matches the selected brand. |
| Fuel filter | Matching stations to the fuel type the user needs. | Implemented in `utils/recommendations/filters/fuel_filter.py`. Opti-Gas checks each station's `fuels` list and keeps only stations that carry the selected fuel type, such as `Unleaded 91`, `Premium 95`, or `Diesel`. |
| Radius filter | Limiting recommendations to stations inside the selected search radius. | Implemented in `utils/recommendations/filters/radius_filter.py`. Opti-Gas compares the user's location to each station using Haversine distance and keeps only nearby stations. |
| Economic cost formula | Estimating the total cost of choosing a station. | Implemented in `utils/recommendations/product_rules/cost.py`. Opti-Gas combines the cost of fuel to buy at the station with the estimated fuel burned while driving there. |
| Min-max normalization | Making pesos, minutes, and kilometers comparable. | Implemented in `utils/recommendations/product_rules/normalization.py`. Opti-Gas converts each metric into a `0` to `1` value before applying weights. |
| Preset weighted scoring | Ranking filtered stations. | Implemented in `utils/recommendations/filters/scoring_filter.py`. Opti-Gas combines normalized cost, travel time, and distance using the selected mode: `opti-route`, `save-money`, `save-time`, or `balanced`. Lower score is better. |
| Tie-break ranking | Keeping station order stable when scores are equal. | Implemented in `utils/recommendations/filters/scoring_filter.py`. Opti-Gas breaks ties by final score, economic cost, distance, duration, fuel price, and station ID. |

## Python Standard Library Utilities

| Utility | Used For | Project Usage |
| --- | --- | --- |
| `statistics.fmean` | Arithmetic mean. | Used in `utils/recommendations/product_rules/cost.py` for candidate and citywide fuel reference-price calculation. This is part of Python's standard library, so it does not appear in `libraries/python.txt`. |

## Third-Party Algorithm Libraries

| Library Or Service | Used For | Project Usage |
| --- | --- | --- |
| `haversine` | Great-circle distance. | Radius filtering and OSM audit distance checks. |
| `openrouteservice` | Live driving routes through OpenRouteService. | Primary live route provider when `ORS_API_KEY` is configured. |
| OSRM public route API | Live driving routes without a project API key. | Secondary live route provider after ORS failure or absence. |
| `cachetools.TTLCache` | Time-limited in-memory route cache. | Stores route results for repeated origin/station pairs. |
| Pydantic | Data validation and coercion. | Recommendation requests, price updates, station records, and fuel records. |
| Fuse.js | Fuzzy search. | Browser-side station search by name, brand, and fuel type. |
| Leaflet | Map rendering and spatial UI behavior. | Map view, station markers, user marker, bounds, and animated focus/recenter actions. |
