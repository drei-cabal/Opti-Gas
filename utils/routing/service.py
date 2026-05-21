from __future__ import annotations

import threading

import openrouteservice
import requests
from cachetools import TTLCache
from openrouteservice import exceptions as ors_exceptions

from utils.geo.location import (
    estimate_duration_min,
    estimate_road_distance_km,
    haversine_distance_km,
)

OSRM_DIRECTIONS_URL = "https://router.project-osrm.org/route/v1/driving"
ROUTE_CACHE_TTL_SEC = 300
ROUTE_CACHE_MAXSIZE = 512
ROUTE_SOURCE_ORS = "ors"
ROUTE_SOURCE_OSRM = "osrm"
ROUTE_SOURCE_FALLBACK = "haversine"
_route_cache: TTLCache = TTLCache(maxsize=ROUTE_CACHE_MAXSIZE, ttl=ROUTE_CACHE_TTL_SEC)
_cache_lock = threading.Lock()
ORS_ROUTE_ERRORS = (
    KeyError,
    IndexError,
    TypeError,
    ValueError,
    ors_exceptions.ApiError,
    ors_exceptions.HTTPError,
    ors_exceptions.Timeout,
)


# Resolve a route for one station using cache first and provider fallbacks second.
def get_route(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str | None = None,
    timeout_sec: float = 6.0,
) -> dict:
    cache_key = _build_cache_key(origin, station["lat"], station["lng"])
    cached = _get_cached_route(cache_key)
    if cached is not None:
        return cached

    route = _resolve_route(origin, station, ors_api_key, timeout_sec)

    _set_cached_route(cache_key, route)
    return route


# Return the local fallback route estimate without calling external providers.
def get_estimated_route(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str | None = None,
) -> dict:
    return _build_haversine_route(origin, station)


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
    return _build_haversine_route(origin, station)


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
            lambda: _fetch_ors_route(origin, station, ors_api_key, timeout_sec)
        )
    providers.append(lambda: _fetch_osrm_route(origin, station, timeout_sec))
    return providers


# Build the cache key used to reuse route results for near-identical origin and station pairs.
def _build_cache_key(
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
def _get_cached_route(cache_key: tuple[float, float, float, float]) -> dict | None:
    with _cache_lock:
        route = _route_cache.get(cache_key)
        if route is None:
            return None
        return dict(route)


# Store a fresh route result in the in-memory cache.
def _set_cached_route(cache_key: tuple[float, float, float, float], route: dict) -> None:
    with _cache_lock:
        _route_cache[cache_key] = dict(route)


# Fetch road distance and duration from OpenRouteService when an API key is configured.
def _fetch_ors_route(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str,
    timeout_sec: float,
) -> dict | None:
    try:
        client = openrouteservice.Client(key=ors_api_key, timeout=timeout_sec)
        payload = client.directions(
            coordinates=[
                [origin[1], origin[0]],
                [station["lng"], station["lat"]],
            ],
            profile="driving-car",
            format="json",
        )
        summary = payload["routes"][0]["summary"]
    except ORS_ROUTE_ERRORS:
        return None

    return _build_route_result(
        distance_km=summary["distance"] / 1000.0,
        duration_min=summary["duration"] / 60.0,
        source=ROUTE_SOURCE_ORS,
    )


# Build the local haversine-based route estimate used when remote providers fail.
def _build_haversine_route(origin: tuple[float, float], station: dict) -> dict:
    straight_line_distance_km = haversine_distance_km(
        origin[0], origin[1], station["lat"], station["lng"]
    )
    distance_km = estimate_road_distance_km(straight_line_distance_km)
    return _build_route_result(
        distance_km=distance_km,
        duration_min=estimate_duration_min(distance_km),
        source=ROUTE_SOURCE_FALLBACK,
    )


# Fetch road distance and duration from the public OSRM service.
def _fetch_osrm_route(
    origin: tuple[float, float],
    station: dict,
    timeout_sec: float,
) -> dict | None:
    url = (
        f"{OSRM_DIRECTIONS_URL}/"
        f"{origin[1]},{origin[0]};{station['lng']},{station['lat']}"
    )
    try:
        response = requests.get(
            url,
            params={"overview": "false"},
            timeout=timeout_sec,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != "Ok":
            return None
        summary = payload["routes"][0]
    except (KeyError, IndexError, requests.RequestException, ValueError):
        return None

    return _build_route_result(
        distance_km=summary["distance"] / 1000.0,
        duration_min=summary["duration"] / 60.0,
        source=ROUTE_SOURCE_OSRM,
    )


# Standardize the route payload shape returned by all providers.
def _build_route_result(distance_km: float, duration_min: float, source: str) -> dict:
    return {
        "distance_km": distance_km,
        "duration_min": duration_min,
        "source": source,
    }
