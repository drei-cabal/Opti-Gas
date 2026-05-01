from __future__ import annotations

import copy
import json
import tempfile
import threading
from datetime import date, datetime
from pathlib import Path


REQUIRED_STATION_FIELDS = {
    "name": str,
    "brand": str,
    "lat": (float, int),
    "lng": (float, int),
    "fuels": list,
}
REQUIRED_FUEL_FIELDS = {
    "fuel_type": str,
    "price": (float, int),
    "last_updated": str,
}
REQUIRED_FUEL_TYPES = {
    "Unleaded 91",
    "Premium 95",
    "Diesel",
}
TAGUM_LAT_RANGE = (7.38, 7.51)
TAGUM_LNG_RANGE = (125.75, 125.86)
_write_lock = threading.Lock()
_cache_lock = threading.Lock()
_station_cache: dict[Path, dict] = {}
_landmark_cache: dict[Path, dict] = {}


class StationValidationError(ValueError):
    """Raised when station data fails validation."""


def load_stations(path: str | Path) -> list[dict]:
    path = Path(path)
    stat = path.stat()
    cache_key = {
        "mtime_ns": stat.st_mtime_ns,
        "size": stat.st_size,
    }

    with _cache_lock:
        cached = _station_cache.get(path)
        if cached and _matches_cache_entry(cached, cache_key):
            return copy.deepcopy(cached["data"])

    payload = _load_json(path)
    normalized = normalize_station_collection(payload)
    validate_station_collection(normalized)
    public_stations = [_strip_runtime_metadata(station) for station in normalized]

    with _cache_lock:
        _station_cache[path] = {**cache_key, "data": copy.deepcopy(public_stations)}
    return public_stations


def load_landmarks(path: str | Path) -> list[dict]:
    path = Path(path)
    stat = path.stat()
    cache_key = {
        "mtime_ns": stat.st_mtime_ns,
        "size": stat.st_size,
    }

    with _cache_lock:
        cached = _landmark_cache.get(path)
        if cached and _matches_cache_entry(cached, cache_key):
            return copy.deepcopy(cached["data"])

    payload = _load_json(path)
    if not isinstance(payload, list):
        raise StationValidationError("Landmarks file must contain an array.")

    with _cache_lock:
        _landmark_cache[path] = {**cache_key, "data": copy.deepcopy(payload)}
    return payload


def validate_station_collection(stations: list[dict]) -> None:
    if not isinstance(stations, list):
        raise StationValidationError("Station data must be a JSON array.")
    for station in stations:
        validate_station_record(station)


def validate_station_record(station: dict) -> None:
    if not isinstance(station, dict):
        raise StationValidationError("Each station entry must be an object.")

    for field_name, expected_type in REQUIRED_STATION_FIELDS.items():
        if field_name not in station:
            raise StationValidationError(f"Missing required field: {field_name}")
        if not isinstance(station[field_name], expected_type):
            raise StationValidationError(f"Invalid type for field: {field_name}")

    name = station["name"].strip()
    if not name:
        raise StationValidationError("Station name cannot be empty.")

    lat = float(station["lat"])
    lng = float(station["lng"])
    if not (TAGUM_LAT_RANGE[0] <= lat <= TAGUM_LAT_RANGE[1]):
        raise StationValidationError(f"Latitude out of Tagum bounds: {name}")
    if not (TAGUM_LNG_RANGE[0] <= lng <= TAGUM_LNG_RANGE[1]):
        raise StationValidationError(f"Longitude out of Tagum bounds: {name}")

    fuels = station["fuels"]
    if not fuels:
        raise StationValidationError(f"Station must have at least one fuel type: {name}")

    seen_fuel_types: set[str] = set()
    for fuel in fuels:
        validate_fuel_record(name, fuel, seen_fuel_types)

    if station.get("_legacy_single_fuel"):
        return

    if seen_fuel_types != REQUIRED_FUEL_TYPES:
        missing = sorted(REQUIRED_FUEL_TYPES - seen_fuel_types)
        extra = sorted(seen_fuel_types - REQUIRED_FUEL_TYPES)
        details: list[str] = []
        if missing:
            details.append(f"missing: {', '.join(missing)}")
        if extra:
            details.append(f"unexpected: {', '.join(extra)}")
        raise StationValidationError(
            f"Station must define exactly Unleaded 91, Premium 95, and Diesel: "
            f"{name} ({'; '.join(details)})"
        )


def validate_fuel_record(
    station_name: str,
    fuel: dict,
    seen_fuel_types: set[str] | None = None,
) -> None:
    if not isinstance(fuel, dict):
        raise StationValidationError(f"Fuel entry must be an object: {station_name}")

    for field_name, expected_type in REQUIRED_FUEL_FIELDS.items():
        if field_name not in fuel:
            raise StationValidationError(
                f"Missing required fuel field: {field_name} ({station_name})"
            )
        if not isinstance(fuel[field_name], expected_type):
            raise StationValidationError(
                f"Invalid fuel field type: {field_name} ({station_name})"
            )

    fuel_type = fuel["fuel_type"].strip()
    if not fuel_type:
        raise StationValidationError(f"fuel_type cannot be empty: {station_name}")
    if seen_fuel_types is not None:
        if fuel_type in seen_fuel_types:
            raise StationValidationError(
                f"Duplicate fuel type for station {station_name}: {fuel_type}"
            )
        seen_fuel_types.add(fuel_type)

    price = float(fuel["price"])
    if price <= 0:
        raise StationValidationError(f"Price must be positive: {station_name} ({fuel_type})")

    try:
        datetime.strptime(fuel["last_updated"], "%Y-%m-%d")
    except ValueError as exc:
        raise StationValidationError(
            f"last_updated must be YYYY-MM-DD: {station_name} ({fuel_type})"
        ) from exc


def update_station_price(
    path: str | Path,
    station_name: str,
    fuel_type: str,
    new_price: float,
    station_id: str | None = None,
    updated_on: date | None = None,
) -> dict:
    updated_on = updated_on or date.today()
    path = Path(path)
    with _write_lock:
        stations = load_stations(path)
        updated_station = None
        for station in stations:
            station_matches = (
                get_station_id(station) == station_id
                if station_id
                else station["name"] == station_name
            )
            if station_matches:
                for fuel in station["fuels"]:
                    if fuel["fuel_type"] == fuel_type:
                        fuel["price"] = round(float(new_price), 2)
                        fuel["last_updated"] = updated_on.isoformat()
                        updated_station = station
                        break
                break

        if updated_station is None:
            raise KeyError(f"{station_name}:{fuel_type}")

        validate_station_collection(stations)
        serialized_stations = [_serialize_station(station) for station in stations]
        _atomic_write_json(path, serialized_stations)
        refreshed_stat = path.stat()
        with _cache_lock:
            _station_cache[path] = {
                "mtime_ns": refreshed_stat.st_mtime_ns,
                "size": refreshed_stat.st_size,
                "data": copy.deepcopy(stations),
            }
        return updated_station


def is_stale_price(last_updated: str, threshold_days: int = 7, today: date | None = None) -> bool:
    today = today or date.today()
    updated_on = datetime.strptime(last_updated, "%Y-%m-%d").date()
    return (today - updated_on).days > threshold_days


def _load_json(path: str | Path):
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _matches_cache_entry(cache_entry: dict, cache_key: dict) -> bool:
    return (
        cache_entry.get("mtime_ns") == cache_key["mtime_ns"]
        and cache_entry.get("size") == cache_key["size"]
    )


def normalize_station_collection(stations: list[dict]) -> list[dict]:
    if not isinstance(stations, list):
        raise StationValidationError("Station data must be a JSON array.")
    return [normalize_station_record(station) for station in stations]


def normalize_station_record(station: dict) -> dict:
    if not isinstance(station, dict):
        raise StationValidationError("Each station entry must be an object.")

    normalized = {
        "name": station.get("name"),
        "brand": station.get("brand"),
        "lat": station.get("lat"),
        "lng": station.get("lng"),
    }

    if "fuels" in station:
        normalized["fuels"] = [normalize_fuel_record(fuel) for fuel in station["fuels"]]
    else:
        normalized["_legacy_single_fuel"] = True
        normalized["fuels"] = [
            normalize_fuel_record(
                {
                    "fuel_type": station.get("fuel_type"),
                    "price": station.get("price"),
                    "last_updated": station.get("last_updated"),
                }
            )
        ]

    normalized["station_id"] = get_station_id(normalized)
    return normalized


def normalize_fuel_record(fuel: dict) -> dict:
    if not isinstance(fuel, dict):
        raise StationValidationError("Fuel entry must be an object.")
    return {
        "fuel_type": fuel.get("fuel_type"),
        "price": fuel.get("price"),
        "last_updated": fuel.get("last_updated"),
    }


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


def get_station_id(station: dict) -> str:
    return f"{float(station['lat']):.6f},{float(station['lng']):.6f}"


def _serialize_station(station: dict) -> dict:
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


def _strip_runtime_metadata(station: dict) -> dict:
    cleaned = dict(station)
    cleaned.pop("_legacy_single_fuel", None)
    return cleaned
