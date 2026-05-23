from __future__ import annotations

from utils.recommendations.engine import recommender


def build_station(name: str, brand: str, lat: float, lng: float, price: float) -> dict:
    return {
        "name": name,
        "brand": brand,
        "lat": lat,
        "lng": lng,
        "fuels": [
            {"fuel_type": "Unleaded 91", "price": price, "last_updated": "2026-04-28"},
            {"fuel_type": "Premium 95", "price": price + 4.0, "last_updated": "2026-04-28"},
            {"fuel_type": "Diesel", "price": price - 2.0, "last_updated": "2026-04-28"},
        ],
    }


def test_recommend_stations_uses_weighted_presets(monkeypatch):
    stations = [
        build_station("Cheap Far", "Shell", 7.45, 125.81, 85.0),
        build_station("Close Costly", "Petron", 7.46, 125.82, 95.0),
        build_station("Middle", "Seaoil", 7.47, 125.83, 90.0),
    ]

    routes = {
        "Cheap Far": {"distance_km": 6.0, "duration_min": 12.0, "source": "ors"},
        "Close Costly": {"distance_km": 1.0, "duration_min": 3.0, "source": "ors"},
        "Middle": {"distance_km": 3.0, "duration_min": 6.0, "source": "ors"},
    }

    monkeypatch.setattr(
        recommender,
        "get_route",
        lambda origin, station, ors_api_key=None: routes[station["name"]],
    )

    save_money = recommender.recommend_stations(
        stations=stations,
        origin=(7.44, 125.8),
        preset="save-money",
        brand="any",
        fuel_type="Unleaded 91",
        radius_km=10,
        ors_api_key="test-key",
    )
    save_time = recommender.recommend_stations(
        stations=stations,
        origin=(7.44, 125.8),
        preset="save-time",
        brand="any",
        fuel_type="Unleaded 91",
        radius_km=10,
        ors_api_key="test-key",
    )

    assert save_money["best"]["name"] == "Cheap Far"
    assert save_time["best"]["name"] == "Close Costly"
    assert save_money["reference_price_source"] == "candidate-average"
    assert "travel_liters" in save_money["best"]
    assert "purchase_cost" in save_money["best"]
    assert "norm_cost" in save_money["best"]
    assert save_money["best"]["preset_used"] == "save-money"


def test_recommend_stations_ranks_by_raw_distance_not_display_distance(monkeypatch):
    stations = [
        build_station("Closer Raw", "Shell", 7.45, 125.81, 90.0),
        build_station("Farther Raw", "Petron", 7.46, 125.82, 90.0),
    ]

    routes = {
        "Closer Raw": {"distance_km": 1.123, "duration_min": 5.0, "source": "ors"},
        "Farther Raw": {"distance_km": 1.124, "duration_min": 5.0, "source": "ors"},
    }

    monkeypatch.setattr(
        recommender,
        "get_route",
        lambda origin, station, ors_api_key=None: routes[station["name"]],
    )

    result = recommender.recommend_stations(
        stations=stations,
        origin=(7.44, 125.8),
        preset="save-time",
        brand="any",
        fuel_type="Unleaded 91",
        radius_km=10,
        ors_api_key="test-key",
    )

    assert result["best"]["name"] == "Closer Raw"
    assert result["candidates"][0]["distance_km"] == 1.12
    assert result["candidates"][1]["distance_km"] == 1.12


def test_recommend_stations_flags_single_option(monkeypatch):
    stations = [build_station("Only Option", "Petron", 7.45, 125.81, 90.0)]

    monkeypatch.setattr(
        recommender,
        "get_route",
        lambda origin, station, ors_api_key=None: {
            "distance_km": 2.2,
            "duration_min": 6.5,
            "source": "osrm",
        },
    )

    result = recommender.recommend_stations(
        stations=stations,
        origin=(7.44, 125.8),
        preset="balanced",
        brand="Petron",
        fuel_type="Unleaded 91",
        radius_km=10,
        ors_api_key=None,
    )

    assert result["candidate_count"] == 1
    assert result["scoring_mode"] == "single-option"
    assert result["best"]["final_score"] is None
    assert result["best"]["primary_reason"] == "Only matching station"


def test_recommend_stations_returns_no_option_when_fuel_missing(monkeypatch):
    stations = [
        {
            "name": "Diesel Only",
            "brand": "Petron",
            "lat": 7.45,
            "lng": 125.81,
            "fuels": [
                {"fuel_type": "Diesel", "price": 88.0, "last_updated": "2026-04-18"}
            ],
        }
    ]

    monkeypatch.setattr(
        recommender,
        "get_route",
        lambda origin, station, ors_api_key=None: {
            "distance_km": 2.2,
            "duration_min": 6.5,
            "source": "ors",
        },
    )

    result = recommender.recommend_stations(
        stations=stations,
        origin=(7.44, 125.8),
        preset="opti-route",
        brand="Petron",
        fuel_type="Unleaded 91",
        radius_km=10,
        ors_api_key=None,
    )

    assert result["best"] is None
    assert result["candidates"] == []
    assert result["scoring_mode"] == "no-option"
    assert result["reason"] == "No stations match the current filters."


def test_recommend_stations_returns_route_unavailable_when_live_routing_fails(monkeypatch):
    stations = [build_station("Estimate Only", "Petron", 7.45, 125.81, 90.0)]

    monkeypatch.setattr(recommender, "get_route", lambda origin, station, ors_api_key=None: None)

    result = recommender.recommend_stations(
        stations=stations,
        origin=(7.44, 125.8),
        preset="balanced",
        brand="Petron",
        fuel_type="Unleaded 91",
        radius_km=10,
        ors_api_key="test-key",
    )

    assert result["best"] is None
    assert result["candidates"] == []
    assert result["candidate_count"] == 0
    assert result["scoring_mode"] == "no-option"
    assert result["reason"] == "Route unavailable for current stations."
