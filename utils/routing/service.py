from __future__ import annotations  # Enable postponed evaluation of type annotations.

from utils.routing.cache import (  # Reuse route cache helpers.
    build_route_cache_key,
    get_cached_route,
    set_cached_route,
)
from utils.routing.fallback import build_haversine_route  # Reuse local fallback route.
from utils.routing.providers import (  # Reuse live route providers.
    fetch_ors_route,
    fetch_osrm_route,
)


# Resolve a route for one station using cache first and provider fallbacks second.
def get_route(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str | None = None,
    timeout_sec: float = 6.0,
) -> dict:
    cache_key = build_route_cache_key(origin, station["lat"], station["lng"])
    cached = get_cached_route(cache_key)
    if cached is not None:
        return cached

    route = _resolve_route(origin, station, ors_api_key, timeout_sec)

    set_cached_route(cache_key, route)
    return route


# Return the local fallback route estimate without calling external providers.
def get_estimated_route(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str | None = None,
) -> dict:
    return build_haversine_route(origin, station)


# Try each routing provider in order before falling back to the local estimate.
def _resolve_route(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str | None,
    timeout_sec: float,
) -> dict:
    providers = _build_route_providers(origin, station, ors_api_key, timeout_sec)
    for provider in providers:
        route = provider()
        if route is not None:
            return route
    return build_haversine_route(origin, station)


# Build the ordered list of route providers available for the current request.
def _build_route_providers(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str | None,
    timeout_sec: float,
) -> list:
    providers = []
    if ors_api_key:
        providers.append(
            lambda: fetch_ors_route(origin, station, ors_api_key, timeout_sec)
        )
    providers.append(lambda: fetch_osrm_route(origin, station, timeout_sec))
    return providers
