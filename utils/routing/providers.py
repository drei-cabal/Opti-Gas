from __future__ import annotations  # Enable postponed evaluation of type annotations.

import openrouteservice  # Call OpenRouteService for live route distance and duration.
import requests  # Call OSRM as the public live-routing fallback.
from openrouteservice import exceptions as ors_exceptions  # Handle OpenRouteService failures.

from utils.routing.results import build_route_result

OSRM_DIRECTIONS_URL = "https://router.project-osrm.org/route/v1/driving"
ROUTE_SOURCE_ORS = "ors"
ROUTE_SOURCE_OSRM = "osrm"
ORS_ROUTE_ERRORS = (
    KeyError,
    IndexError,
    TypeError,
    ValueError,
    ors_exceptions.ApiError,
    ors_exceptions.HTTPError,
    ors_exceptions.Timeout,
)


# Fetch road distance and duration from OpenRouteService when an API key is configured.
def fetch_ors_route(
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

    return build_route_result(
        distance_km=summary["distance"] / 1000.0,
        duration_min=summary["duration"] / 60.0,
        source=ROUTE_SOURCE_ORS,
    )


# Fetch road distance and duration from the public OSRM service.
def fetch_osrm_route(
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

    return build_route_result(
        distance_km=summary["distance"] / 1000.0,
        duration_min=summary["duration"] / 60.0,
        source=ROUTE_SOURCE_OSRM,
    )
