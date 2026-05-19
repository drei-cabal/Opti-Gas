from __future__ import annotations

import hmac
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, current_app, jsonify, render_template, request
from flask_limiter import Limiter
from flask_limiter.errors import RateLimitExceeded
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman
from pydantic import (
    BaseModel,
    ConfigDict,
    ValidationError,
    field_validator,
    model_validator,
)

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
DEFAULT_RECOMMEND_RATE_LIMIT_COUNT = 60
DEFAULT_RECOMMEND_RATE_LIMIT_WINDOW_SEC = 60
DEFAULT_RATE_LIMIT_STORAGE_URI = "memory://"

CONTENT_SECURITY_POLICY = {
    "default-src": "'self'",
    "script-src": ["'self'", "https://unpkg.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "https://*.basemaps.cartocdn.com"],
    "connect-src": "'self'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "frame-ancestors": "'self'",
}


class PriceUpdateRequestModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    station_id: str = ""
    station_name: str = ""
    fuel_type: str = ""
    new_price: float

    @field_validator("station_id", "station_name", "fuel_type", mode="before")
    @classmethod
    def _strip_text(cls, value: object) -> str:
        return str(value or "").strip()

    @field_validator("fuel_type")
    @classmethod
    def _validate_fuel_type(cls, value: str) -> str:
        if not value:
            raise ValueError("fuel_type is required.")
        return value

    @field_validator("new_price")
    @classmethod
    def _validate_new_price(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("new_price must be positive.")
        if not (MIN_DEMO_FUEL_PRICE <= value <= MAX_DEMO_FUEL_PRICE):
            raise ValueError(
                f"new_price must be between {MIN_DEMO_FUEL_PRICE:.2f} "
                f"and {MAX_DEMO_FUEL_PRICE:.2f}."
            )
        return value

    @model_validator(mode="after")
    def _validate_station_identity(self):
        if not self.station_name and not self.station_id:
            raise ValueError("station_name is required.")
        return self


def create_app(test_config: dict | None = None) -> Flask:
    load_dotenv()

    app = Flask(__name__)
    app.config.update(
        ORS_API_KEY=os.getenv("ORS_API_KEY", "").strip(),
        PRICE_UPDATE_TOKEN=os.getenv("PRICE_UPDATE_TOKEN", "").strip(),
        RECOMMEND_RATE_LIMIT_COUNT=_get_int_env(
            "RECOMMEND_RATE_LIMIT_COUNT", DEFAULT_RECOMMEND_RATE_LIMIT_COUNT
        ),
        RECOMMEND_RATE_LIMIT_WINDOW_SEC=_get_int_env(
            "RECOMMEND_RATE_LIMIT_WINDOW_SEC",
            DEFAULT_RECOMMEND_RATE_LIMIT_WINDOW_SEC,
        ),
        RATELIMIT_STORAGE_URI=os.getenv(
            "RATELIMIT_STORAGE_URI", DEFAULT_RATE_LIMIT_STORAGE_URI
        ).strip(),
        ROUTING_MODE=_normalize_routing_mode(os.getenv("ROUTING_MODE", "estimate")),
        SECURITY_FORCE_HTTPS=_get_bool_env("SECURITY_FORCE_HTTPS", False),
        STATIONS_PATH=BASE_DIR / "data" / "stations" / "stations.json",
        LANDMARKS_PATH=BASE_DIR / "data" / "landmarks.json",
        BROWSER_LIBRARIES_PATH=BASE_DIR / "libraries" / "browser.json",
    )

    if test_config:
        app.config.update(test_config)

    Talisman(
        app,
        content_security_policy=CONTENT_SECURITY_POLICY,
        force_https=bool(app.config["SECURITY_FORCE_HTTPS"]),
        strict_transport_security=bool(app.config["SECURITY_FORCE_HTTPS"]),
        session_cookie_secure=bool(app.config["SECURITY_FORCE_HTTPS"]),
    )
    limiter = Limiter(
        get_remote_address,
        app=app,
        storage_uri=app.config["RATELIMIT_STORAGE_URI"],
        headers_enabled=True,
    )

    @app.errorhandler(RateLimitExceeded)
    def handle_rate_limit_exceeded(exc):
        retry_after = getattr(exc, "retry_after", None) or 1
        response = jsonify(
            {
                "error": (
                    "Too many recommendation requests. "
                    f"Try again in {int(retry_after)} seconds."
                )
            }
        )
        response.status_code = 429
        response.headers["Retry-After"] = str(int(retry_after))
        return response

    @app.get("/")
    def index():
        return render_template(
            "index.html",
            browser_libraries=_load_browser_libraries(
                app.config["BROWSER_LIBRARIES_PATH"]
            ),
        )

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
    @limiter.limit(
        _get_recommend_rate_limit,
        exempt_when=_is_recommend_rate_limit_disabled,
    )
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
            routing_mode=app.config["ROUTING_MODE"],
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
        try:
            price_update_request = _parse_price_update_request(payload)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        try:
            updated_station = update_station_price(
                app.config["STATIONS_PATH"],
                station_name=price_update_request.station_name,
                station_id=price_update_request.station_id or None,
                fuel_type=price_update_request.fuel_type,
                new_price=price_update_request.new_price,
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
            if fuel["fuel_type"] == price_update_request.fuel_type
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


def _parse_price_update_request(payload: dict) -> PriceUpdateRequestModel:
    try:
        return PriceUpdateRequestModel.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(_first_price_update_validation_error(exc)) from exc


def _first_price_update_validation_error(exc: ValidationError) -> str:
    error = exc.errors()[0]
    if not error["loc"]:
        return str(error["msg"]).removeprefix("Value error, ")
    field_name = str(error["loc"][0])
    if field_name == "new_price" and error["type"].startswith("float_"):
        return "new_price must be numeric."
    if error["type"] == "missing":
        return f"{field_name} is required."
    return str(error["msg"]).removeprefix("Value error, ")


def _get_recommend_rate_limit() -> str:
    count = max(1, int(current_app.config["RECOMMEND_RATE_LIMIT_COUNT"]))
    window_sec = max(1, int(current_app.config["RECOMMEND_RATE_LIMIT_WINDOW_SEC"]))
    return f"{count} per {window_sec} second"


def _is_recommend_rate_limit_disabled() -> bool:
    return int(current_app.config["RECOMMEND_RATE_LIMIT_COUNT"]) <= 0


def _get_int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)).strip())
    except ValueError:
        return default


def _get_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _normalize_routing_mode(raw_mode: str | None) -> str:
    mode = (raw_mode or "").strip().lower()
    if mode == "live":
        return "live"
    return "estimate"


def _load_browser_libraries(path: str | Path) -> list[dict]:
    with Path(path).open("r", encoding="utf-8") as handle:
        libraries = json.load(handle)
    if not isinstance(libraries, list):
        raise ValueError("Browser libraries manifest must contain an array.")
    return libraries


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "0.0.0.0"),
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
    )
