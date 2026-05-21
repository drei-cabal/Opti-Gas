# Enable postponed evaluation of type annotations.
from __future__ import annotations

# Type the request query object accepted by the parser.
from collections.abc import Mapping

# Validate and normalize recommendation request fields.
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)

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
QUERY_FIELDS = {
    "lat": ("lat", None),
    "lng": ("lng", None),
    "radius_km": ("radius_km", 5.0),
    "preset": ("mode", "opti-route"),
    "brand": ("brand", "any"),
    "fuel_type": ("fuel_type", "Unleaded 91"),
    "km_per_liter": ("km_per_liter", DEFAULT_KM_PER_LITER),
    "liters_to_fill": ("liters_to_fill", DEFAULT_LITERS_TO_FILL),
}


# Validates and normalizes recommendation query parameters.
class RecommendationRequestModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    lat: float
    lng: float
    radius_km: float = Field(default=5.0, gt=0)
    preset: str = "opti-route"
    brand: str = "any"
    fuel_type: str = Field(default="Unleaded 91", min_length=1)
    km_per_liter: float = Field(default=DEFAULT_KM_PER_LITER, gt=0)
    liters_to_fill: float = Field(default=DEFAULT_LITERS_TO_FILL, gt=0)

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


# Parse and validate recommendation query parameters into normalized backend inputs.
def parse_recommendation_request(query_args: Mapping[str, str]) -> dict:
    try:
        request_model = RecommendationRequestModel.model_validate(_query_payload(query_args))
    except ValidationError as exc:
        raise ValueError(_first_validation_error(exc)) from exc

    return request_model.model_dump()


# Normalize preset aliases and fall back to the default recommendation mode.
def normalize_preset(value: str) -> str:
    normalized = PRESET_ALIASES.get(str(value).strip().lower(), str(value).strip().lower())
    return normalized or "opti-route"


# Convert Flask query arguments into model field names and defaults.
def _query_payload(query_args: Mapping[str, str]) -> dict:
    return {
        field_name: query_args.get(query_name, default)
        for field_name, (query_name, default) in QUERY_FIELDS.items()
    }


# Return a stable request-friendly error message from Pydantic validation details.
def _first_validation_error(exc: ValidationError) -> str:
    error = exc.errors()[0]
    field_name = str(error["loc"][0])
    if error["type"] == "missing" or error.get("input") in {None, ""}:
        return f"{field_name} is required."
    if error["type"].startswith(("float_", "int_")):
        return f"{field_name} must be numeric."
    if error["type"] == "greater_than":
        return f"{field_name} must be positive."
    return str(error["msg"]).removeprefix("Value error, ")
