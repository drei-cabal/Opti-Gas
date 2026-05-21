from __future__ import annotations

import json
from datetime import date

import pytest

from utils.data.station_store import (
    StationValidationError,
    is_stale_price,
    load_landmarks,
    load_stations,
    update_station_price,
)


def build_fuel(
    fuel_type: str,
    price: float = 90.2,
    last_updated: str = "2026-04-20",
) -> dict:
    return {"fuel_type": fuel_type, "price": price, "last_updated": last_updated}


def build_station(**overrides) -> dict:
    station = {
        "name": "Petron Apokon",
        "brand": "Petron",
        "lat": 7.4523,
        "lng": 125.8142,
        "fuels": [
            build_fuel("Unleaded 91", 90.2),
            build_fuel("Premium 95", 94.4),
            build_fuel("Diesel", 88.8),
        ],
    }
    station.update(overrides)
    return station


def write_json(path, payload) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def write_stations(path, stations: list[dict]) -> None:
    write_json(path, stations)


def test_load_stations_allows_duplicate_names(tmp_path):
    stations_path = tmp_path / "stations.json"
    write_stations(
        stations_path,
        [
            build_station(name="Shell Tagum", brand="Shell", lat=7.4489, lng=125.8101),
            build_station(name="Shell Tagum", brand="Shell", lat=7.4479, lng=125.8068),
        ],
    )

    payload = load_stations(stations_path)

    assert len(payload) == 2
    assert payload[0]["name"] == "Shell Tagum"
    assert payload[1]["name"] == "Shell Tagum"


def test_load_stations_returns_cache_safe_copies(tmp_path):
    stations_path = tmp_path / "stations.json"
    write_stations(stations_path, [build_station()])

    first_payload = load_stations(stations_path)
    first_payload[0]["fuels"][0]["price"] = 1.0

    second_payload = load_stations(stations_path)
    assert second_payload[0]["fuels"][0]["price"] == 90.2


def test_load_landmarks_requires_array(tmp_path):
    landmarks_path = tmp_path / "landmarks.json"
    write_json(landmarks_path, {"name": "not a list"})

    with pytest.raises(StationValidationError, match="Landmarks file must contain an array."):
        load_landmarks(landmarks_path)


def test_update_station_price_writes_new_value(tmp_path):
    stations_path = tmp_path / "stations.json"
    write_stations(stations_path, [build_station()])

    updated = update_station_price(
        stations_path,
        station_name="Petron Apokon",
        station_id="7.452300,125.814200",
        fuel_type="Diesel",
        new_price=93.1,
        updated_on=date(2026, 4, 28),
    )

    payload = json.loads(stations_path.read_text(encoding="utf-8"))
    updated_fuel = next(fuel for fuel in updated["fuels"] if fuel["fuel_type"] == "Diesel")
    payload_fuel = next(
        fuel for fuel in payload[0]["fuels"] if fuel["fuel_type"] == "Diesel"
    )
    assert updated_fuel["price"] == 93.1
    assert updated_fuel["last_updated"] == "2026-04-28"
    assert payload_fuel["price"] == 93.1


def test_update_station_price_targets_duplicate_name_by_station_id(tmp_path):
    stations_path = tmp_path / "stations.json"
    write_stations(
        stations_path,
        [
            build_station(name="Shell Tagum", brand="Shell", lat=7.4489, lng=125.8101),
            build_station(name="Shell Tagum", brand="Shell", lat=7.4479, lng=125.8068),
        ],
    )

    updated = update_station_price(
        stations_path,
        station_name="Shell Tagum",
        station_id="7.447900,125.806800",
        fuel_type="Diesel",
        new_price=90.1,
        updated_on=date(2026, 4, 28),
    )

    payload = json.loads(stations_path.read_text(encoding="utf-8"))
    assert updated["station_id"] == "7.447900,125.806800"
    assert payload[0]["fuels"][2]["price"] == 88.8
    assert payload[1]["fuels"][2]["price"] == 90.1


def test_is_stale_price_threshold():
    assert is_stale_price("2026-04-10", threshold_days=7, today=date(2026, 4, 28)) is True
    assert is_stale_price("2026-04-24", threshold_days=7, today=date(2026, 4, 28)) is False


def test_load_stations_normalizes_legacy_single_fuel_records(tmp_path):
    stations_path = tmp_path / "stations.json"
    write_stations(
        stations_path,
        [
            {
                "name": "Legacy Station",
                "brand": "Petron",
                "lat": 7.4523,
                "lng": 125.8142,
                "price": 90.2,
                "fuel_type": "Unleaded 91",
                "last_updated": "2026-04-20",
            }
        ],
    )

    payload = load_stations(stations_path)
    assert payload[0]["fuels"][0]["fuel_type"] == "Unleaded 91"


def test_load_stations_requires_all_three_fuel_types(tmp_path):
    stations_path = tmp_path / "stations.json"
    write_stations(
        stations_path,
        [
            build_station(
                name="Incomplete Station",
                fuels=[build_fuel("Unleaded 91"), build_fuel("Diesel", 88.2)],
            )
        ],
    )

    with pytest.raises(StationValidationError):
        load_stations(stations_path)


def test_load_stations_rejects_duplicate_fuel_types(tmp_path):
    stations_path = tmp_path / "stations.json"
    write_stations(
        stations_path,
        [
            build_station(
                name="Duplicate Fuel Station",
                fuels=[
                    build_fuel("Diesel", 88.2),
                    build_fuel("Diesel", 89.2),
                    build_fuel("Unleaded 91"),
                ],
            )
        ],
    )

    with pytest.raises(
        StationValidationError,
        match="Duplicate fuel type for station Duplicate Fuel Station: Diesel",
    ):
        load_stations(stations_path)


@pytest.mark.parametrize(
    ("station", "message"),
    [
        (build_station(brand=None), "Invalid type for field: brand"),
        (build_station(lat="7.4523"), "Invalid type for field: lat"),
        (build_station(lat=8.0), "Latitude out of Tagum bounds: Petron Apokon"),
        (build_station(lng=126.0), "Longitude out of Tagum bounds: Petron Apokon"),
        (
            build_station(
                fuels=[
                    build_fuel("Unleaded 91", last_updated="04-20-2026"),
                    build_fuel("Premium 95", 94.4),
                    build_fuel("Diesel", 88.8),
                ]
            ),
            "last_updated must be YYYY-MM-DD.",
        ),
    ],
)
def test_load_stations_preserves_validation_messages(tmp_path, station, message):
    stations_path = tmp_path / "stations.json"
    write_stations(stations_path, [station])

    with pytest.raises(StationValidationError, match=message):
        load_stations(stations_path)


def test_load_stations_preserves_missing_raw_field_message(tmp_path):
    stations_path = tmp_path / "stations.json"
    station = build_station()
    del station["brand"]
    write_stations(stations_path, [station])

    with pytest.raises(StationValidationError, match="Invalid type for field: brand"):
        load_stations(stations_path)
