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


def diesel_price_from_file(stations_path):
    stations = json.loads(stations_path.read_text(encoding="utf-8"))
    diesel = next(
        fuel for fuel in stations[0]["fuels"] if fuel["fuel_type"] == "Diesel"
    )
    return diesel["price"]


def use_mock_route(monkeypatch):
    monkeypatch.setattr(
        "utils.recommendations.engine.recommender.get_route",
        lambda origin, station, ors_api_key=None: {
            "distance_km": 2.2,
            "duration_min": 6.5,
            "source": "osrm",
        },
    )


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


def test_index_sets_security_headers(tmp_path):
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    browser_libraries_path = tmp_path / "browser.json"
    browser_libraries_path.write_text(
        json.dumps(
            [
                {
                    "name": "DOMPurify",
                    "src": "https://unpkg.com/dompurify@3.4.3/dist/purify.min.js",
                    "integrity": (
                        "sha384-eCz05P6PHhVK1N9YlA/YY0JLOp3wc37jUGRWexbZ3VZj66h7exte7mtRSD6QoOgZ"
                    ),
                    "crossorigin": "anonymous",
                    "referrerpolicy": "no-referrer",
                }
            ]
        ),
        encoding="utf-8",
    )
    app = create_app(
        {
            "TESTING": True,
            "RECOMMEND_RATE_LIMIT_COUNT": 0,
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
            "BROWSER_LIBRARIES_PATH": browser_libraries_path,
        }
    )

    response = app.test_client().get("/")

    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in response.headers["Content-Security-Policy"]
    html = response.get_data(as_text=True)
    assert "https://unpkg.com/dompurify@3.4.3/dist/purify.min.js" in html
    assert "sha384-eCz05P6PHhVK1N9YlA/YY0JLOp3wc37jUGRWexbZ3VZj66h7exte7mtRSD6QoOgZ" in html


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


def test_api_recommend_returns_selected_fuel(tmp_path, monkeypatch):
    use_mock_route(monkeypatch)
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
    assert "fallback_warning" not in payload


def test_api_recommend_returns_route_unavailable_when_live_routing_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "utils.recommendations.engine.recommender.get_route",
        lambda origin, station, ors_api_key=None: None,
    )
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
    assert payload["best"] is None
    assert payload["candidates"] == []
    assert payload["candidate_count"] == 0
    assert payload["scoring_mode"] == "no-option"
    assert payload["reason"] == "Route unavailable for current stations."
    assert "fallback_warning" not in payload


def test_api_recommend_rate_limit_blocks_excess_requests(tmp_path, monkeypatch):
    use_mock_route(monkeypatch)
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "RECOMMEND_RATE_LIMIT_COUNT": 2,
            "RECOMMEND_RATE_LIMIT_WINDOW_SEC": 60,
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
        }
    )
    client = app.test_client()
    path = (
        "/api/recommend?lat=7.4478&lng=125.8079&mode=balanced"
        "&brand=any&fuel_type=Diesel&radius_km=5"
    )

    assert client.get(path).status_code == 200
    assert client.get(path).status_code == 200

    response = client.get(path)

    assert response.status_code == 429
    assert response.headers["Retry-After"].isdigit()
    assert response.get_json()["error"].startswith("Too many recommendation requests.")


def test_api_recommend_rate_limit_can_be_disabled(tmp_path, monkeypatch):
    use_mock_route(monkeypatch)
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "RECOMMEND_RATE_LIMIT_COUNT": 0,
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
        }
    )
    client = app.test_client()
    path = (
        "/api/recommend?lat=7.4478&lng=125.8079&mode=balanced"
        "&brand=any&fuel_type=Diesel&radius_km=5"
    )

    responses = [client.get(path) for _ in range(3)]

    assert [response.status_code for response in responses] == [200, 200, 200]


def test_api_update_price_without_configured_token_allows_valid_update(tmp_path):
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


def test_api_update_price_rejects_price_below_demo_minimum(tmp_path):
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
            "new_price": 1,
        },
    )

    assert response.status_code == 400
    assert response.get_json() == {
        "error": "new_price must be between 20.00 and 200.00."
    }


def test_api_update_price_rejects_price_above_demo_maximum(tmp_path):
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
            "new_price": 999,
        },
    )

    assert response.status_code == 400
    assert response.get_json() == {
        "error": "new_price must be between 20.00 and 200.00."
    }


def test_api_update_price_validation_failure_does_not_mutate_file(tmp_path):
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
        }
    )
    original_price = diesel_price_from_file(stations_path)

    response = app.test_client().post(
        "/api/update-price",
        json={
            "station_name": "Petron Apokon",
            "station_id": "7.452300,125.814200",
            "fuel_type": "Diesel",
            "new_price": 999,
        },
    )

    assert response.status_code == 400
    assert diesel_price_from_file(stations_path) == original_price


def test_api_update_price_with_configured_token_requires_header(tmp_path):
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "PRICE_UPDATE_TOKEN": "test-token",
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

    assert response.status_code == 401
    assert response.get_json() == {"error": "Invalid price update token."}


def test_api_update_price_with_configured_token_rejects_wrong_header(tmp_path):
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "PRICE_UPDATE_TOKEN": "test-token",
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
        }
    )

    response = app.test_client().post(
        "/api/update-price",
        headers={"X-Price-Update-Token": "wrong-token"},
        json={
            "station_name": "Petron Apokon",
            "station_id": "7.452300,125.814200",
            "fuel_type": "Diesel",
            "new_price": 93.45,
        },
    )

    assert response.status_code == 401
    assert response.get_json() == {"error": "Invalid price update token."}


def test_api_update_price_with_configured_token_accepts_matching_header(tmp_path):
    stations_path, landmarks_path = write_fixture_files(tmp_path)
    app = create_app(
        {
            "TESTING": True,
            "PRICE_UPDATE_TOKEN": "test-token",
            "STATIONS_PATH": stations_path,
            "LANDMARKS_PATH": landmarks_path,
        }
    )

    response = app.test_client().post(
        "/api/update-price",
        headers={"X-Price-Update-Token": "test-token"},
        json={
            "station_name": "Petron Apokon",
            "station_id": "7.452300,125.814200",
            "fuel_type": "Diesel",
            "new_price": 93.45,
        },
    )

    assert response.status_code == 200
    payload = response.get_json()
    updated_fuel = next(
        fuel for fuel in payload["station"]["fuels"] if fuel["fuel_type"] == "Diesel"
    )
    assert updated_fuel["price"] == 93.45


def test_api_update_price_then_recommend_reflects_change(tmp_path, monkeypatch):
    use_mock_route(monkeypatch)
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
