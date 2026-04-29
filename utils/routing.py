from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import requests

from utils.location import (
    estimate_fallback_duration_min,
    estimate_road_distance_km,
    haversine_distance_km,
)


ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/json"
OSRM_DIRECTIONS_URL = "https://router.project-osrm.org/route/v1/driving"
ROUTE_CACHE_TTL_SEC = 300
ROUTE_SOURCE_ORS = "ors"
ROUTE_SOURCE_OSRM = "osrm"
ROUTE_SOURCE_FALLBACK = "haversine"
ROUTE_CACHE_PATH = Path(__file__).resolve().parents[1] / ".tmp" / "route_cache.json"
_route_cache: dict[tuple[float, float, float, float], dict] = {}
_cache_lock = threading.Lock()


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


def _get_cached_route(cache_key: tuple[float, float, float, float]) -> dict | None:
    now = time.time()
    with _cache_lock:
        entry = _route_cache.get(cache_key)
        if not entry:
            return None
        if now - entry["cached_at"] > ROUTE_CACHE_TTL_SEC:
            _route_cache.pop(cache_key, None)
            _persist_route_cache_unlocked()
            return None
        return dict(entry["route"])


def _set_cached_route(cache_key: tuple[float, float, float, float], route: dict) -> None:
    with _cache_lock:
        _route_cache[cache_key] = {"cached_at": time.time(), "route": dict(route)}
        _persist_route_cache_unlocked()


def _fetch_ors_route(
    origin: tuple[float, float],
    station: dict,
    ors_api_key: str,
    timeout_sec: float,
) -> dict | None:
    try:
        response = requests.post(
            ORS_DIRECTIONS_URL,
            headers={
                "Authorization": ors_api_key,
                "Content-Type": "application/json",
            },
            json={
                "coordinates": [
                    [origin[1], origin[0]],
                    [station["lng"], station["lat"]],
                ]
            },
            timeout=timeout_sec,
        )
        response.raise_for_status()
        payload = response.json()
        summary = payload["routes"][0]["summary"]
    except (KeyError, IndexError, requests.RequestException, ValueError):
        return None

    return _build_route_result(
        distance_km=summary["distance"] / 1000.0,
        duration_min=summary["duration"] / 60.0,
        source=ROUTE_SOURCE_ORS,
    )


def _build_haversine_route(origin: tuple[float, float], station: dict) -> dict:
    straight_line_distance_km = haversine_distance_km(
        origin[0], origin[1], station["lat"], station["lng"]
    )
    distance_km = estimate_road_distance_km(straight_line_distance_km)
    return _build_route_result(
        distance_km=distance_km,
        duration_min=estimate_fallback_duration_min(straight_line_distance_km),
        source=ROUTE_SOURCE_FALLBACK,
    )


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


def _build_route_result(distance_km: float, duration_min: float, source: str) -> dict:
    return {
        "distance_km": distance_km,
        "duration_min": duration_min,
        "source": source,
    }


def _persist_route_cache_unlocked() -> None:
    try:
        ROUTE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            _cache_key_to_string(cache_key): value
            for cache_key, value in _route_cache.items()
        }
        ROUTE_CACHE_PATH.write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        return


def _load_persistent_route_cache() -> None:
    if not ROUTE_CACHE_PATH.exists():
        return

    try:
        payload = json.loads(ROUTE_CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return

    now = time.time()
    for cache_key_text, entry in payload.items():
        cache_key = _cache_key_from_string(cache_key_text)
        if cache_key is None or not isinstance(entry, dict):
            continue
        cached_at = entry.get("cached_at")
        route = entry.get("route")
        if not isinstance(cached_at, (int, float)) or not isinstance(route, dict):
            continue
        if now - cached_at > ROUTE_CACHE_TTL_SEC:
            continue
        _route_cache[cache_key] = {"cached_at": cached_at, "route": route}


def _cache_key_to_string(cache_key: tuple[float, float, float, float]) -> str:
    return "|".join(str(part) for part in cache_key)


def _cache_key_from_string(cache_key_text: str) -> tuple[float, float, float, float] | None:
    try:
        origin_lat, origin_lng, station_lat, station_lng = cache_key_text.split("|")
        return (
            float(origin_lat),
            float(origin_lng),
            float(station_lat),
            float(station_lng),
        )
    except (TypeError, ValueError):
        return None


_load_persistent_route_cache()
