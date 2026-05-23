from __future__ import annotations  # Enable postponed evaluation of type annotations.

from utils.routing.cache import (  # Reuse route cache helpers.
    build_route_cache_key,
    get_cached_route,
    set_cached_route,
)
from utils.routing.fallback import get_estimated_route  # Build local fallback routes.
from utils.routing.providers import (  # Reuse live route providers.
    fetch_ors_route,
    fetch_osrm_route,
)

ROUTING_MODE_ESTIMATE = "estimate"
ROUTING_MODE_LIVE = "live"


# Resolve a route for one station using cache, live providers, and local fallback.
def get_route(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str | None = None,
    timeout_sec: float = 6.0,
    routing_mode: str = ROUTING_MODE_LIVE,
) -> dict:
    mode = _normalize_routing_mode(routing_mode)
    cache_key = build_route_cache_key(origin, station["lat"], station["lng"], mode)
    cached = get_cached_route(cache_key)
    if cached is not None:
        return cached

    if mode == ROUTING_MODE_ESTIMATE:
        route = get_estimated_route(origin, station)
        set_cached_route(cache_key, route)
        return route

    route = _resolve_route(origin, station, ors_api_key, timeout_sec)
    if route is None:
        route = get_estimated_route(origin, station)

    set_cached_route(cache_key, route)
    return route


# Try each live routing provider in order and return None when no live route is available.
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


# Keep unknown routing modes safe by falling back to live-first behavior.
def _normalize_routing_mode(routing_mode: str | None) -> str:
    mode = (routing_mode or ROUTING_MODE_LIVE).strip().lower()
    if mode == ROUTING_MODE_ESTIMATE:
        return ROUTING_MODE_ESTIMATE
    return ROUTING_MODE_LIVE
