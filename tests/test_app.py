from __future__ import annotations

import json

from app import create_app


def write_fixture_files(tmp_path):
    stations_path = tmp_path / "stations.json"
    landmarks_path = tmp_path / "landmarks.json"

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
                            "last_updated": "2026-04-28",
                        },
                        {
                            "fuel_type": "Diesel",
                            "price": 88.9,
                            "last_updated": "2026-04-28",
                        },
                        {
                            "fuel_type": "Premium 95",
                            "price": 94.7,
                            "last_updated": "2026-04-28",
                        },
                    ],
                }
            ]
        ),
        encoding="utf-8",
    )
    landmarks_path.write_text(
        json.dumps([{"name": "SM Tagum", "lat": 7.4479, "lng": 125.8068}]),
        encoding="utf-8",
    )
    return stations_path, landmarks_path


def test_api_stations(tmp_path):
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
        }
    )

    response = app.test_client().get("/api/stations")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload[0]["name"] == "Petron Apokon"
    assert payload[0]["station_id"] == "7.452300,125.814200"


def test_api_recommend_requires_numeric_inputs(tmp_path):
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
        }
    )

    response = app.test_client().get(
        "/api/recommend?lat=bad&lng=125.8&mode=opti-route&brand=any&fuel_type=Unleaded%2091&radius_km=5"
    )
    assert response.status_code == 400


def test_api_recommend_returns_selected_fuel(tmp_path):
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
        }
    )

    response = app.test_client().get(
        "/api/recommend?lat=7.4478&lng=125.8079&mode=balanced&brand=any&fuel_type=Diesel&radius_km=5"
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["best"]["fuel_type"] == "Diesel"
    assert payload["preset_used"] == "balanced"
    assert payload["candidate_count"] == 1
    assert payload["scoring_mode"] == "single-option"
    assert payload["reference_price_source"] == "citywide-average"
    assert "travel_liters" in payload["best"]
    assert "purchase_cost" in payload["best"]
    assert "norm_distance" in payload["best"]


def test_api_update_price(tmp_path):
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
        }
    )

    response = app.test_client().post(
        "/api/update-price",
        json={
            "station_name": "Petron Apokon",
            "station_id": "7.452300,125.814200",
            "fuel_type": "Diesel",
            "new_price": 93.45,
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["station"]["station_id"] == "7.452300,125.814200"
    updated_fuel = next(
        fuel for fuel in payload["station"]["fuels"] if fuel["fuel_type"] == "Diesel"
    )
    assert updated_fuel["price"] == 93.45


def test_api_update_price_then_recommend_reflects_change(tmp_path):
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
        }
    )
    client = app.test_client()

    update_response = client.post(
        "/api/update-price",
        json={
            "station_name": "Petron Apokon",
            "station_id": "7.452300,125.814200",
            "fuel_type": "Diesel",
            "new_price": 97.5,
        },
    )
    assert update_response.status_code == 200

    recommend_response = client.get(
        "/api/recommend?lat=7.4478&lng=125.8079&mode=balanced&brand=any&fuel_type=Diesel&radius_km=5"
    )
    assert recommend_response.status_code == 200
    payload = recommend_response.get_json()
    assert payload["best"]["fuel_type"] == "Diesel"
    assert payload["best"]["price"] == 97.5
