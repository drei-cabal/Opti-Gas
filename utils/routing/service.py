from __future__ import annotations  # Enable postponed evaluation of type annotations.

from utils.routing.cache import (  # Reuse route cache helpers.
    build_route_cache_key,
    get_cached_route,
    set_cached_route,
)
from utils.routing.providers import (  # Reuse live route providers.
    fetch_ors_route,
    fetch_osrm_route,
)


# Resolve a route for one station using cache first and live providers second.
def get_route(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str | None = None,
    timeout_sec: float = 6.0,
) -> dict | None:
    cache_key = build_route_cache_key(origin, station["lat"], station["lng"])
    cached = get_cached_route(cache_key)
    if cached is not None:
        return cached

    route = _resolve_route(origin, station, ors_api_key, timeout_sec)
    if route is None:
        return None

    set_cached_route(cache_key, route)
    return route


# Try each live routing provider in order and return None when no route is available.
def _resolve_route(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str | None,
    timeout_sec: float,
) -> dict | None:
    providers = _build_route_providers(origin, station, ors_api_key, timeout_sec)
    for provider in providers:
        route = provider()
        if route is not None:
            return route
    return None


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
