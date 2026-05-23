from __future__ import annotations  # Enable postponed evaluation of type annotations.

import threading  # Coordinate access to the in-memory route cache.

from cachetools import TTLCache  # Store short-lived route results in memory.

ROUTE_CACHE_TTL_SEC = 300
ROUTE_CACHE_MAXSIZE = 512
_route_cache: TTLCache = TTLCache(maxsize=ROUTE_CACHE_MAXSIZE, ttl=ROUTE_CACHE_TTL_SEC)
_cache_lock = threading.Lock()


# Build the cache key used to reuse route results for near-identical origin and station pairs.
def build_route_cache_key(
    origin: tuple[float, float],
    station_lat: float,
    station_lng: float,
) -> tuple[float, float, float, float]:
    return (
        round(origin[0], 4),
        round(origin[1], 4),
        round(float(station_lat), 6),
        round(float(station_lng), 6),
    )


# Return a cached route if it is still fresh enough to reuse.
def get_cached_route(cache_key: tuple[float, float, float, float]) -> dict | None:
    with _cache_lock:
        route = _route_cache.get(cache_key)
        if route is None:
            return None
        return dict(route)


# Store a fresh route result in the in-memory cache.
def set_cached_route(cache_key: tuple[float, float, float, float], route: dict) -> None:
    with _cache_lock:
        _route_cache[cache_key] = dict(route)
