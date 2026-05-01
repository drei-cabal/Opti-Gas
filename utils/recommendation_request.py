from __future__ import annotations

from collections.abc import Mapping

from utils.scoring import (
    DEFAULT_KM_PER_LITER,
    DEFAULT_LITERS_TO_FILL,
    RECOMMENDATION_PRESETS,
)

PRESET_ALIASES = {
    "shortest": "save-time",
    "cheapest": "save-money",
}


def parse_recommendation_request(query_args: Mapping[str, str]) -> dict:
    lat = _parse_float_arg(query_args, "lat")
    lng = _parse_float_arg(query_args, "lng")
    radius_km = _parse_float_arg(query_args, "radius_km", default=5.0)
    preset = normalize_preset(query_args.get("mode", "opti-route"))
    brand = str(query_args.get("brand", "any")).strip()
    fuel_type = str(query_args.get("fuel_type", "Unleaded 91")).strip()
    km_per_liter = _parse_float_arg(
        query_args,
        "km_per_liter",
        default=DEFAULT_KM_PER_LITER,
    )
    liters_to_fill = _parse_float_arg(
        query_args,
        "liters_to_fill",
        default=DEFAULT_LITERS_TO_FILL,
    )

    if preset not in RECOMMENDATION_PRESETS:
        raise ValueError("Unsupported preset.")
    if radius_km <= 0:
        raise ValueError("radius_km must be positive.")
    if km_per_liter <= 0:
        raise ValueError("km_per_liter must be positive.")
    if liters_to_fill <= 0:
        raise ValueError("liters_to_fill must be positive.")
    if not fuel_type:
        raise ValueError("fuel_type is required.")

    return {
        "lat": lat,
        "lng": lng,
        "radius_km": radius_km,
        "preset": preset,
        "brand": brand,
        "fuel_type": fuel_type,
        "km_per_liter": km_per_liter,
        "liters_to_fill": liters_to_fill,
    }


def normalize_preset(value: str) -> str:
    normalized = PRESET_ALIASES.get(str(value).strip().lower(), str(value).strip().lower())
    return normalized or "opti-route"


def _parse_float_arg(
    query_args: Mapping[str, str],
    name: str,
    default: float | None = None,
) -> float:
    raw = query_args.get(name, None if default is None else str(default))
    if raw is None or str(raw).strip() == "":
        raise ValueError(f"{name} is required.")
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be numeric.") from exc
