# Enable postponed evaluation of type annotations.
from __future__ import annotations

# Parse and validate station fuel update dates.
from datetime import datetime

# Build strict station and fuel validation models.
from pydantic import (
    BaseModel,
    ConfigDict,
    ValidationError,
    ValidationInfo,
    field_validator,
    model_validator,
)

type FuelDict = dict[str, object]
type StationDict = dict[str, object]
type StationCollection = list[StationDict]

REQUIRED_FUEL_TYPES = {
    "Unleaded 91",
    "Premium 95",
    "Diesel",
}
TAGUM_LAT_RANGE = (7.38, 7.51)
TAGUM_LNG_RANGE = (125.75, 125.86)


# Raised when station or fuel data fails validation.
class StationValidationError(ValueError):
    """Raised when station data fails validation."""


# Validates one fuel entry from a station record.
class FuelRecordModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    fuel_type: str
    price: float
    last_updated: str

    @field_validator("fuel_type", mode="before")
    @classmethod
    # Normalize and validate a required fuel type string.
    def _validate_fuel_type(cls, value: object, info: ValidationInfo) -> str:
        if not isinstance(value, str):
            raise ValueError(f"Invalid fuel field type: {info.field_name}")
        value = value.strip()
        if not value:
            raise ValueError("fuel_type cannot be empty.")
        return value

    @field_validator("price", mode="before")
    @classmethod
    # Require fuel prices to be numeric before Pydantic coercion.
    def _require_numeric_price(cls, value: object) -> float:
        if not isinstance(value, (float, int)):
            raise ValueError("Invalid fuel field type: price")
        return float(value)

    @field_validator("price")
    @classmethod
    # Reject zero or negative fuel prices.
    def _validate_price(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Price must be positive.")
        return value

    @field_validator("last_updated", mode="before")
    @classmethod
    # Validate fuel update dates in YYYY-MM-DD format.
    def _validate_last_updated(cls, value: object, info: ValidationInfo) -> str:
        if not isinstance(value, str):
            raise ValueError(f"Invalid fuel field type: {info.field_name}")
        value = value.strip()
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("last_updated must be YYYY-MM-DD.") from exc
        return value


# Validates one station record and its product rules.
class StationRecordModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    brand: str
    lat: float
    lng: float
    fuels: list[FuelRecordModel]

    @field_validator("name", "brand", mode="before")
    @classmethod
    # Normalize required station text fields.
    def _require_text(cls, value: object, info: ValidationInfo) -> str:
        if not isinstance(value, str):
            raise ValueError(f"Invalid type for field: {info.field_name}")
        value = value.strip()
        if info.field_name == "name" and not value:
            raise ValueError("Station name cannot be empty.")
        return value

    @field_validator("lat", "lng", mode="before")
    @classmethod
    # Require coordinates to be numeric before bounds checks.
    def _require_numeric_coordinate(cls, value: object, info: ValidationInfo) -> float:
        if not isinstance(value, (float, int)):
            raise ValueError(f"Invalid type for field: {info.field_name}")
        return float(value)

    @field_validator("fuels")
    @classmethod
    # Require every station to carry at least one fuel entry.
    def _validate_fuels(cls, value: list[FuelRecordModel]) -> list[FuelRecordModel]:
        if not value:
            raise ValueError("Station must have at least one fuel type.")
        return value

    @model_validator(mode="after")
    # Enforce Tagum bounds, duplicate fuel checks, and required fuel coverage.
    def _validate_station_rules(self, info: ValidationInfo) -> StationRecordModel:
        for label, value, bounds in (
            ("Latitude", self.lat, TAGUM_LAT_RANGE),
            ("Longitude", self.lng, TAGUM_LNG_RANGE),
        ):
            if not (bounds[0] <= value <= bounds[1]):
                raise ValueError(f"{label} out of Tagum bounds: {self.name}")

        seen_fuel_types = set()
        for fuel in self.fuels:
            if fuel.fuel_type in seen_fuel_types:
                raise ValueError(
                    f"Duplicate fuel type for station {self.name}: {fuel.fuel_type}"
                )
            seen_fuel_types.add(fuel.fuel_type)

        if info.context and info.context.get("legacy_single_fuel"):
            return self

        if seen_fuel_types != REQUIRED_FUEL_TYPES:
            missing = sorted(REQUIRED_FUEL_TYPES - seen_fuel_types)
            extra = sorted(seen_fuel_types - REQUIRED_FUEL_TYPES)
            details = [
                detail
                for detail in (
                    f"missing: {', '.join(missing)}" if missing else "",
                    f"unexpected: {', '.join(extra)}" if extra else "",
                )
                if detail
            ]
            raise ValueError(
                f"Station must define exactly Unleaded 91, Premium 95, and Diesel: "
                f"{self.name} ({'; '.join(details)})"
            )
        return self


# Validate one normalized station dictionary through the Pydantic station model.
def validate_station_model(station: StationDict) -> StationRecordModel:
    try:
        return StationRecordModel.model_validate(
            station,
            context={"legacy_single_fuel": station.get("_legacy_single_fuel")},
        )
    except ValidationError as exc:
        raise StationValidationError(format_validation_error(exc)) from exc


# Validate one fuel dictionary through the Pydantic fuel model.
def validate_fuel_model(fuel: FuelDict, station_name: str) -> FuelRecordModel:
    try:
        return FuelRecordModel.model_validate(fuel)
    except ValidationError as exc:
        message = format_validation_error(exc)
        raise StationValidationError(f"{message}: {station_name}") from exc


# Convert Pydantic validation details into the stable station-store error text.
def format_validation_error(exc: ValidationError) -> str:
    error = exc.errors()[0]
    loc = error["loc"]
    field_name = str(loc[-1]) if loc else "value"
    if error["type"] == "missing":
        return f"Missing required field: {field_name}"
    return str(error["msg"]).removeprefix("Value error, ")
