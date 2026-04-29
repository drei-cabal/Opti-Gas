from __future__ import annotations

import json
from datetime import date

import pytest

from utils.station_store import (
    StationValidationError,
    is_stale_price,
    load_stations,
    update_station_price,
)


def test_load_stations_allows_duplicate_names(tmp_path):
    stations_path = tmp_path / "stations.json"
    stations_path.write_text(
        json.dumps(
            [
                {
                    "name": "Shell Tagum",
                    "brand": "Shell",
                    "lat": 7.4489,
                    "lng": 125.8101,
                    "fuels": [
                        {
                            "fuel_type": "Unleaded 91",
                            "price": 92.5,
                            "last_updated": "2026-04-21",
                        },
                        {
                            "fuel_type": "Premium 95",
                            "price": 95.0,
                            "last_updated": "2026-04-21",
                        },
                        {
                            "fuel_type": "Diesel",
                            "price": 89.4,
                            "last_updated": "2026-04-21",
                        }
                    ],
                },
                {
                    "name": "Shell Tagum",
                    "brand": "Shell",
                    "lat": 7.4479,
                    "lng": 125.8068,
                    "fuels": [
                        {
                            "fuel_type": "Unleaded 91",
                            "price": 91.5,
                            "last_updated": "2026-04-22",
                        },
                        {
                            "fuel_type": "Premium 95",
                            "price": 94.9,
                            "last_updated": "2026-04-22",
                        },
                        {
                            "fuel_type": "Diesel",
                            "price": 88.8,
                            "last_updated": "2026-04-22",
                        }
                    ],
                },
            ]
        ),
        encoding="utf-8",
    )

    payload = load_stations(stations_path)
    assert len(payload) == 2
    assert payload[0]["name"] == "Shell Tagum"
    assert payload[1]["name"] == "Shell Tagum"


def test_update_station_price_writes_new_value(tmp_path):
    stations_path = tmp_path / "stations.json"
    stations_path.write_text(
        json.dumps(
            [
                {
                    "name": "Petron Apokon",
                    "brand": "Petron",
                    "lat": 7.4523,
                    "lng": 125.8142,
                    "fuels": [
                        {
                            "fuel_type": "Unleaded 91",
                            "price": 90.2,
                            "last_updated": "2026-04-20",
                        },
                        {
                            "fuel_type": "Diesel",
                            "price": 88.8,
                            "last_updated": "2026-04-20",
                        },
                        {
                            "fuel_type": "Premium 95",
                            "price": 94.4,
                            "last_updated": "2026-04-20",
                        },
                    ],
                }
            ]
        ),
        encoding="utf-8",
    )

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
    assert updated_fuel["price"] == 93.1
    assert updated_fuel["last_updated"] == "2026-04-28"
    payload_fuel = next(
        fuel for fuel in payload[0]["fuels"] if fuel["fuel_type"] == "Diesel"
    )
    assert payload_fuel["price"] == 93.1


def test_update_station_price_targets_duplicate_name_by_station_id(tmp_path):
    stations_path = tmp_path / "stations.json"
    stations_path.write_text(
        json.dumps(
            [
                {
                    "name": "Shell Tagum",
                    "brand": "Shell",
                    "lat": 7.4489,
                    "lng": 125.8101,
                    "fuels": [
                        {"fuel_type": "Unleaded 91", "price": 92.5, "last_updated": "2026-04-21"},
                        {"fuel_type": "Premium 95", "price": 95.0, "last_updated": "2026-04-21"},
                        {"fuel_type": "Diesel", "price": 89.4, "last_updated": "2026-04-21"},
                    ],
                },
                {
                    "name": "Shell Tagum",
                    "brand": "Shell",
                    "lat": 7.4479,
                    "lng": 125.8068,
                    "fuels": [
                        {"fuel_type": "Unleaded 91", "price": 91.5, "last_updated": "2026-04-22"},
                        {"fuel_type": "Premium 95", "price": 94.9, "last_updated": "2026-04-22"},
                        {"fuel_type": "Diesel", "price": 88.8, "last_updated": "2026-04-22"},
                    ],
                },
            ]
        ),
        encoding="utf-8",
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
    assert payload[0]["fuels"][2]["price"] == 89.4
    assert payload[1]["fuels"][2]["price"] == 90.1


def test_is_stale_price_threshold():
    assert is_stale_price("2026-04-10", threshold_days=7, today=date(2026, 4, 28)) is True
    assert is_stale_price("2026-04-24", threshold_days=7, today=date(2026, 4, 28)) is False


def test_load_stations_normalizes_legacy_single_fuel_records(tmp_path):
    stations_path = tmp_path / "stations.json"
    stations_path.write_text(
        json.dumps(
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
            ]
        ),
        encoding="utf-8",
    )

    payload = load_stations(stations_path)
    assert payload[0]["fuels"][0]["fuel_type"] == "Unleaded 91"


def test_load_stations_requires_all_three_fuel_types(tmp_path):
    stations_path = tmp_path / "stations.json"
    stations_path.write_text(
        json.dumps(
            [
                {
                    "name": "Incomplete Station",
                    "brand": "Petron",
                    "lat": 7.4523,
                    "lng": 125.8142,
                    "fuels": [
                        {
                            "fuel_type": "Unleaded 91",
                            "price": 90.2,
                            "last_updated": "2026-04-20",
                        },
                        {
                            "fuel_type": "Diesel",
                            "price": 88.2,
                            "last_updated": "2026-04-20",
                        },
                    ],
                }
            ]
        ),
        encoding="utf-8",
    )

    with pytest.raises(StationValidationError):
        load_stations(stations_path)
