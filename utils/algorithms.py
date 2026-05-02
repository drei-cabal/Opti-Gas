from __future__ import annotations

from utils.recommendation_pipeline import recommend_stations_result
from utils.routing import get_route
from utils.scoring import (
    DEFAULT_KM_PER_LITER,
    DEFAULT_LITERS_TO_FILL,
)


# Preserve the existing public recommendation entrypoint while delegating to the pipeline seam.
def recommend_stations(
    stations: list[dict],
    origin: tuple[float, float],
    preset: str,
    brand: str,
    fuel_type: str,
    radius_km: float,
    ors_api_key: str | None = None,
    km_per_liter: float = DEFAULT_KM_PER_LITER,
    liters_to_fill: float = DEFAULT_LITERS_TO_FILL,
) -> dict:
    return recommend_stations_result(
        stations=stations,
        origin=origin,
        preset=preset,
        brand=brand,
        fuel_type=fuel_type,
        radius_km=radius_km,
        route_getter=get_route,
        ors_api_key=ors_api_key,
        km_per_liter=km_per_liter,
        liters_to_fill=liters_to_fill,
    )
