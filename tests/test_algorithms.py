from __future__ import annotations

from utils import algorithms


def test_recommend_stations_prefers_lowest_trip_cost(monkeypatch):
    stations = [
        {
            "name": "A",
            "brand": "Petron",
            "lat": 7.45,
            "lng": 125.81,
            "fuels": [
                {
                    "fuel_type": "Unleaded 91",
                    "price": 90.0,
                    "last_updated": "2026-04-28",
                },
                {
                    "fuel_type": "Premium 95",
                    "price": 95.0,
                    "last_updated": "2026-04-28",
                },
                {
                    "fuel_type": "Diesel",
                    "price": 88.0,
                    "last_updated": "2026-04-28",
                }
            ],
        },
        {
            "name": "B",
            "brand": "Shell",
            "lat": 7.46,
            "lng": 125.82,
            "fuels": [
                {
                    "fuel_type": "Unleaded 91",
                    "price": 85.0,
                    "last_updated": "2026-04-28",
                },
                {
                    "fuel_type": "Premium 95",
                    "price": 91.0,
                    "last_updated": "2026-04-28",
                },
                {
                    "fuel_type": "Diesel",
                    "price": 84.0,
                    "last_updated": "2026-04-28",
                }
            ],
        },
    ]

    def fake_get_route(origin, station, ors_api_key=None):
        return {
            "distance_km": 1.0 if station["name"] == "A" else 3.0,
            "duration_min": 5.0,
            "source": "ors",
        }

    monkeypatch.setattr(algorithms, "get_route", fake_get_route)

    result = algorithms.recommend_stations(
        stations=stations,
        origin=(7.44, 125.8),
        mode="opti-route",
        brand="any",
        fuel_type="Unleaded 91",
        radius_km=10,
        ors_api_key="test-key",
    )

    assert result["best"]["name"] == "B"
    assert result["fallback_warning"] is False


def test_recommend_stations_flags_fallback(monkeypatch):
    stations = [
        {
            "name": "A",
            "brand": "Petron",
            "lat": 7.45,
            "lng": 125.81,
            "fuels": [
                {
                    "fuel_type": "Unleaded 91",
                    "price": 90.0,
                    "last_updated": "2026-04-18",
                },
                {
                    "fuel_type": "Premium 95",
                    "price": 94.0,
                    "last_updated": "2026-04-18",
                },
                {
                    "fuel_type": "Diesel",
                    "price": 88.0,
                    "last_updated": "2026-04-18",
                }
            ],
        }
    ]

    monkeypatch.setattr(
        algorithms,
        "get_route",
        lambda origin, station, ors_api_key=None: {
            "distance_km": 2.2,
            "duration_min": 6.5,
            "source": "haversine",
        },
    )

    result = algorithms.recommend_stations(
        stations=stations,
        origin=(7.44, 125.8),
        mode="shortest",
        brand="Petron",
        fuel_type="Unleaded 91",
        radius_km=10,
        ors_api_key=None,
    )

    assert result["best"]["distance_source"] == "haversine"
    assert result["fallback_warning"] is True


def test_recommend_stations_keeps_duplicate_names_as_distinct_locations(monkeypatch):
    stations = [
        {
            "name": "Shell Tagum",
            "brand": "Shell",
            "lat": 7.45,
            "lng": 125.81,
            "fuels": [
                {"fuel_type": "Unleaded 91", "price": 90.0, "last_updated": "2026-04-28"},
                {"fuel_type": "Premium 95", "price": 95.0, "last_updated": "2026-04-28"},
                {"fuel_type": "Diesel", "price": 88.0, "last_updated": "2026-04-28"},
            ],
        },
        {
            "name": "Shell Tagum",
            "brand": "Shell",
            "lat": 7.46,
            "lng": 125.82,
            "fuels": [
                {"fuel_type": "Unleaded 91", "price": 91.0, "last_updated": "2026-04-28"},
                {"fuel_type": "Premium 95", "price": 96.0, "last_updated": "2026-04-28"},
                {"fuel_type": "Diesel", "price": 89.0, "last_updated": "2026-04-28"},
            ],
        },
    ]

    monkeypatch.setattr(
        algorithms,
        "get_route",
        lambda origin, station, ors_api_key=None: {
            "distance_km": 1.0 if station["lat"] == 7.45 else 2.0,
            "duration_min": 5.0,
            "source": "ors",
        },
    )

    result = algorithms.recommend_stations(
        stations=stations,
        origin=(7.44, 125.8),
        mode="shortest",
        brand="any",
        fuel_type="Unleaded 91",
        radius_km=10,
        ors_api_key="test-key",
    )

    assert len(result["candidates"]) == 2
    assert result["candidates"][0]["station_id"] != result["candidates"][1]["station_id"]


def test_recommend_stations_skips_stations_without_selected_fuel(monkeypatch):
    stations = [
        {
            "name": "Diesel Only",
            "brand": "Petron",
            "lat": 7.45,
            "lng": 125.81,
            "fuels": [
                {
                    "fuel_type": "Diesel",
                    "price": 88.0,
                    "last_updated": "2026-04-18",
                }
            ],
        }
    ]

    monkeypatch.setattr(
        algorithms,
        "get_route",
        lambda origin, station, ors_api_key=None: {
            "distance_km": 2.2,
            "duration_min": 6.5,
            "source": "ors",
        },
    )

    result = algorithms.recommend_stations(
        stations=stations,
        origin=(7.44, 125.8),
        mode="shortest",
        brand="Petron",
        fuel_type="Unleaded 91",
        radius_km=10,
        ors_api_key=None,
    )

    assert result["best"] is None
    assert result["candidates"] == []
