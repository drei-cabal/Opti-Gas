from __future__ import annotations

import json
import tempfile
import threading
from datetime import date, datetime
from pathlib import Path

from utils.data.cache import CacheStore, file_cache_key, get_cached, set_cached
from utils.data.models import (
    FuelDict,
    StationCollection,
    StationDict,
    StationValidationError,
    validate_fuel_model,
    validate_station_model,
)

_write_lock = threading.Lock()
_station_cache: CacheStore = {}
_landmark_cache: CacheStore = {}


# Load, normalize, validate, and cache the public station collection.
def load_stations(path: str | Path) -> StationCollection:
    path = Path(path)
    cache_key = file_cache_key(path)
    cached = get_cached(path, _station_cache, cache_key)
    if cached is not None:
        return cached

    normalized = normalize_station_collection(_load_json(path))
    validate_station_collection(normalized)
    public_stations = [_strip_runtime_metadata(station) for station in normalized]

    set_cached(path, _station_cache, cache_key, public_stations)
    return public_stations


# Load and cache landmark records after checking the file shape.
def load_landmarks(path: str | Path) -> StationCollection:
    path = Path(path)
    cache_key = file_cache_key(path)
    cached = get_cached(path, _landmark_cache, cache_key)
    if cached is not None:
        return cached

    payload = _load_json(path)
    if not isinstance(payload, list):
        raise StationValidationError("Landmarks file must contain an array.")

    set_cached(path, _landmark_cache, cache_key, payload)
    return payload


# Validate every station record in a collection.
def validate_station_collection(stations: object) -> None:
    if not isinstance(stations, list):
        raise StationValidationError("Station data must be a JSON array.")
    for station in stations:
        validate_station_record(station)


# Validate one station record after checking that it is object-shaped.
def validate_station_record(station: object) -> None:
    if not isinstance(station, dict):
        raise StationValidationError("Each station entry must be an object.")
    validate_station_model(station)


# Validate one fuel record and optionally track duplicate fuel types.
def validate_fuel_record(
    station_name: str,
    fuel: object,
    seen_fuel_types: set[str] | None = None,
) -> None:
    if not isinstance(fuel, dict):
        raise StationValidationError(f"Fuel entry must be an object: {station_name}")

    fuel_type = validate_fuel_model(fuel, station_name).fuel_type
    if seen_fuel_types is None:
        return
    if fuel_type in seen_fuel_types:
        raise StationValidationError(
            f"Duplicate fuel type for station {station_name}: {fuel_type}"
        )
    seen_fuel_types.add(fuel_type)


# Update one station fuel price, then validate and persist the station file.
def update_station_price(
    path: str | Path,
    station_name: str,
    fuel_type: str,
    new_price: float,
    station_id: str | None = None,
    updated_on: date | None = None,
) -> StationDict:
    updated_on = updated_on or date.today()
    path = Path(path)
    with _write_lock:
        stations = load_stations(path)
        missing_key = f"{station_name}:{fuel_type}"
        updated_station = _find_station(stations, station_name, station_id, missing_key)
        updated_fuel = _find_fuel(updated_station, fuel_type)

        updated_fuel["price"] = round(float(new_price), 2)
        updated_fuel["last_updated"] = updated_on.isoformat()
        validate_station_collection(stations)
        _atomic_write_json(path, [_serialize_station(station) for station in stations])
        set_cached(path, _station_cache, file_cache_key(path), stations)
        return updated_station


# Return whether a fuel price date is older than the threshold.
def is_stale_price(last_updated: str, threshold_days: int = 7, today: date | None = None) -> bool:
    today = today or date.today()
    updated_on = datetime.strptime(last_updated, "%Y-%m-%d").date()
    return (today - updated_on).days > threshold_days


# Normalize a raw station collection into the runtime shape.
def normalize_station_collection(stations: object) -> StationCollection:
    if not isinstance(stations, list):
        raise StationValidationError("Station data must be a JSON array.")
    return [normalize_station_record(station) for station in stations]


# Normalize one raw station record, including legacy single-fuel records.
def normalize_station_record(station: object) -> StationDict:
    if not isinstance(station, dict):
        raise StationValidationError("Each station entry must be an object.")

    normalized: StationDict = {
        "name": station.get("name"),
        "brand": station.get("brand"),
        "lat": station.get("lat"),
        "lng": station.get("lng"),
    }

    fuels = station.get("fuels")
    if fuels is None:
        normalized["_legacy_single_fuel"] = True
        fuels = [
            {
                "fuel_type": station.get("fuel_type"),
                "price": station.get("price"),
                "last_updated": station.get("last_updated"),
            }
        ]

    normalized["fuels"] = [normalize_fuel_record(fuel) for fuel in fuels]
    normalized["station_id"] = get_station_id(normalized)
    return normalized


# Normalize one raw fuel record into the runtime fuel shape.
def normalize_fuel_record(fuel: object) -> FuelDict:
    if not isinstance(fuel, dict):
        raise StationValidationError("Fuel entry must be an object.")
    return {
        "fuel_type": fuel.get("fuel_type"),
        "price": fuel.get("price"),
        "last_updated": fuel.get("last_updated"),
    }


# Build the stable coordinate-based station identifier.
def get_station_id(station: StationDict) -> str:
    return f"{float(station['lat']):.6f},{float(station['lng']):.6f}"


# Find the station targeted by station ID or station name.
def _find_station(
    stations: StationCollection,
    station_name: str,
    station_id: str | None,
    missing_key: str,
) -> StationDict:
    station = next(
        (
            station
            for station in stations
            if (
                get_station_id(station) == station_id
                if station_id
                else station["name"] == station_name
            )
        ),
        None,
    )
    if station is None:
        raise KeyError(missing_key)
    return station


# Find a fuel entry on a station by fuel type.
def _find_fuel(station: StationDict, fuel_type: str) -> FuelDict:
    fuel = next(
        (fuel for fuel in station["fuels"] if fuel["fuel_type"] == fuel_type),
        None,
    )
    if fuel is None:
        raise KeyError(f"{station['name']}:{fuel_type}")
    return fuel


# Read one JSON file from disk using UTF-8.
def _load_json(path: str | Path):
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


# Write JSON by replacing the target file with a temporary file.
def _atomic_write_json(path: Path, payload) -> None:
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        delete=False,
        dir=path.parent,
        suffix=".tmp",
    ) as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
        temp_path = Path(handle.name)
    temp_path.replace(path)


# Convert a runtime station back into the persisted JSON shape.
def _serialize_station(station: StationDict) -> StationDict:
    return {
        "name": station["name"],
        "brand": station["brand"],
        "lat": station["lat"],
        "lng": station["lng"],
        "fuels": [
            {
                "fuel_type": fuel["fuel_type"],
                "price": fuel["price"],
                "last_updated": fuel["last_updated"],
            }
            for fuel in station["fuels"]
        ],
    }


# Remove runtime-only metadata before returning station data publicly.
def _strip_runtime_metadata(station: StationDict) -> StationDict:
    cleaned = dict(station)
    cleaned.pop("_legacy_single_fuel", None)
    return cleaned
