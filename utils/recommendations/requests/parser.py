# Enable postponed evaluation of type annotations.
from __future__ import annotations

# Type the request query object accepted by the parser.
from collections.abc import Mapping

# Validate and normalize recommendation request fields.
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

# Reuse defaults and supported mode names from product-rule presets.
from utils.recommendations.product_rules.presets import (
    DEFAULT_KM_PER_LITER,
    DEFAULT_LITERS_TO_FILL,
    RECOMMENDATION_PRESETS,
)

PRESET_ALIASES = {
    "shortest": "save-time",
    "cheapest": "save-money",
}


# Validates and normalizes recommendation query parameters.
class RecommendationRequestModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    lat: float
    lng: float
    radius_km: float = 5.0
    preset: str = "opti-route"
    brand: str = "any"
    fuel_type: str = "Unleaded 91"
    km_per_liter: float = DEFAULT_KM_PER_LITER
    liters_to_fill: float = DEFAULT_LITERS_TO_FILL

    @field_validator("preset", mode="before")
    @classmethod
    # Normalize legacy and empty preset values before preset validation.
    def _normalize_preset(cls, value: str) -> str:
        return normalize_preset(value)

    @field_validator("brand", "fuel_type", mode="before")
    @classmethod
    # Strip filter text values before storing them on the request model.
    def _strip_text(cls, value: str) -> str:
        return str(value or "").strip()

    @field_validator("preset")
    @classmethod
    # Reject unsupported recommendation presets.
    def _validate_preset(cls, value: str) -> str:
        if value not in RECOMMENDATION_PRESETS:
            raise ValueError("Unsupported preset.")
        return value

    @field_validator("radius_km")
    @classmethod
    # Require a positive search radius.
    def _validate_radius(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("radius_km must be positive.")
        return value

    @field_validator("km_per_liter")
    @classmethod
    # Require positive vehicle fuel efficiency.
    def _validate_km_per_liter(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("km_per_liter must be positive.")
        return value

    @field_validator("liters_to_fill")
    @classmethod
    # Require a positive planned refill amount.
    def _validate_liters_to_fill(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("liters_to_fill must be positive.")
        return value

    @field_validator("fuel_type")
    @classmethod
    # Require a selected fuel type.
    def _validate_fuel_type(cls, value: str) -> str:
        if not value:
            raise ValueError("fuel_type is required.")
        return value


# Parse and validate recommendation query parameters into normalized backend inputs.
def parse_recommendation_request(query_args: Mapping[str, str]) -> dict:
    try:
        request_model = RecommendationRequestModel.model_validate(
            {
                "lat": query_args.get("lat"),
                "lng": query_args.get("lng"),
                "radius_km": query_args.get("radius_km", 5.0),
                "preset": query_args.get("mode", "opti-route"),
                "brand": query_args.get("brand", "any"),
                "fuel_type": query_args.get("fuel_type", "Unleaded 91"),
                "km_per_liter": query_args.get(
                    "km_per_liter", DEFAULT_KM_PER_LITER
                ),
                "liters_to_fill": query_args.get(
                    "liters_to_fill", DEFAULT_LITERS_TO_FILL
                ),
            }
        )
    except ValidationError as exc:
        raise ValueError(_first_validation_error(exc)) from exc

    return request_model.model_dump()


# Normalize preset aliases and fall back to the default recommendation mode.
def normalize_preset(value: str) -> str:
    normalized = PRESET_ALIASES.get(str(value).strip().lower(), str(value).strip().lower())
    return normalized or "opti-route"


# Return a stable request-friendly error message from Pydantic validation details.
def _first_validation_error(exc: ValidationError) -> str:
    error = exc.errors()[0]
    field_name = str(error["loc"][0])
    if error["type"] == "missing" or error.get("input") in {None, ""}:
        return f"{field_name} is required."
    if error["type"].startswith(("float_", "int_")):
        return f"{field_name} must be numeric."
    return str(error["msg"]).removeprefix("Value error, ")
