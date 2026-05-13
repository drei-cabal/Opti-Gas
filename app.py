from __future__ import annotations

import hmac
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

from utils.algorithms import recommend_stations
from utils.recommendation_request import parse_recommendation_request
from utils.station_store import (
    StationValidationError,
    get_station_id,
    load_landmarks,
    load_stations,
    update_station_price,
)


BASE_DIR = Path(__file__).resolve().parent
PRICE_UPDATE_TOKEN_HEADER = "X-Price-Update-Token"
MIN_DEMO_FUEL_PRICE = 20.0
MAX_DEMO_FUEL_PRICE = 200.0


def create_app(test_config: dict | None = None) -> Flask:
    load_dotenv()

    app = Flask(__name__)
    app.config.update(
        ORS_API_KEY=os.getenv("ORS_API_KEY", "").strip(),
        PRICE_UPDATE_TOKEN=os.getenv("PRICE_UPDATE_TOKEN", "").strip(),
        STATIONS_PATH=BASE_DIR / "data" / "stations" / "stations.json",
        LANDMARKS_PATH=BASE_DIR / "data" / "landmarks.json",
    )

    if test_config:
        app.config.update(test_config)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/stations")
    def api_stations():
        stations = load_stations(app.config["STATIONS_PATH"])
        return jsonify(
            [
                {
                    **station,
                    "station_id": get_station_id(station),
                }
                for station in stations
            ]
        )

    @app.get("/api/landmarks")
    def api_landmarks():
        landmarks = load_landmarks(app.config["LANDMARKS_PATH"])
        return jsonify(landmarks)

    @app.get("/api/recommend")
    def api_recommend():
        try:
            recommendation_request = parse_recommendation_request(request.args)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        stations = load_stations(app.config["STATIONS_PATH"])
        recommendation = recommend_stations(
            stations=stations,
            origin=(recommendation_request["lat"], recommendation_request["lng"]),
            preset=recommendation_request["preset"],
            brand=recommendation_request["brand"],
            fuel_type=recommendation_request["fuel_type"],
            radius_km=recommendation_request["radius_km"],
            ors_api_key=app.config["ORS_API_KEY"],
            km_per_liter=recommendation_request["km_per_liter"],
            liters_to_fill=recommendation_request["liters_to_fill"],
        )
        return jsonify(recommendation)

    @app.post("/api/update-price")
    def api_update_price():
        if not _is_price_update_authorized(
            app.config["PRICE_UPDATE_TOKEN"],
            request.headers.get(PRICE_UPDATE_TOKEN_HEADER),
        ):
            return jsonify({"error": "Invalid price update token."}), 401

        payload = request.get_json(silent=True) or {}
        station_id = str(payload.get("station_id", "")).strip()
        station_name = str(payload.get("station_name", "")).strip()
        fuel_type = str(payload.get("fuel_type", "")).strip()
        new_price = payload.get("new_price")

        if not station_name and not station_id:
            return jsonify({"error": "station_name is required."}), 400
        if not fuel_type:
            return jsonify({"error": "fuel_type is required."}), 400

        try:
            new_price = float(new_price)
        except (TypeError, ValueError):
            return jsonify({"error": "new_price must be numeric."}), 400

        if new_price <= 0:
            return jsonify({"error": "new_price must be positive."}), 400
        if not (MIN_DEMO_FUEL_PRICE <= new_price <= MAX_DEMO_FUEL_PRICE):
            return jsonify(
                {
                    "error": (
                        f"new_price must be between {MIN_DEMO_FUEL_PRICE:.2f} "
                        f"and {MAX_DEMO_FUEL_PRICE:.2f}."
                    )
                }
            ), 400

        try:
            updated_station = update_station_price(
                app.config["STATIONS_PATH"],
                station_name=station_name,
                station_id=station_id or None,
                fuel_type=fuel_type,
                new_price=new_price,
            )
        except FileNotFoundError:
            return jsonify({"error": "Station data file not found."}), 500
        except KeyError:
            return jsonify({"error": "Unknown station."}), 404
        except StationValidationError as exc:
            return jsonify({"error": str(exc)}), 400

        updated_fuel = next(
            fuel
            for fuel in updated_station["fuels"]
            if fuel["fuel_type"] == fuel_type
        )
        return jsonify(
            {
                "success": True,
                "last_updated": updated_fuel["last_updated"],
                "station": updated_station,
            }
        )

    return app


def _is_price_update_authorized(
    configured_token: str | None,
    provided_token: str | None,
) -> bool:
    if not configured_token:
        return True
    return hmac.compare_digest(provided_token or "", configured_token)


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "0.0.0.0"),
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
    )
