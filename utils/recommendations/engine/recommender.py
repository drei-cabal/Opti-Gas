from __future__ import annotations  # Enable postponed evaluation of type annotations.

from utils.recommendations.engine.pipeline import (
    recommend_stations_result,  # Delegate to the pipeline.
)
from utils.recommendations.product_rules.presets import (  # Reuse default trip assumptions.
    DEFAULT_KM_PER_LITER,
    DEFAULT_LITERS_TO_FILL,
)
from utils.routing.service import get_route  # Resolve live or estimated routes.


# Preserve the existing public recommendation entrypoint while delegating to the pipeline seam.
def recommend_stations(
    stations: list[dict],
    origin: tuple[float, float],
    preset: str,
    brand: str,
    fuel_type: str,
    radius_km: float,
    ors_api_key: str | None = None,
    routing_mode: str = "live",
    km_per_liter: float = DEFAULT_KM_PER_LITER,
    liters_to_fill: float = DEFAULT_LITERS_TO_FILL,
) -> dict:
    # Bind routing mode here so the recommendation pipeline keeps a simple route callback.
    def route_getter(
        origin: tuple[float, float],
        station: dict,
        ors_api_key: str | None = None,
    ) -> dict:
        return get_route(
            origin,
            station,
            ors_api_key=ors_api_key,
            routing_mode=routing_mode,
        )

    return recommend_stations_result(
        stations=stations,
        origin=origin,
        preset=preset,
        brand=brand,
        fuel_type=fuel_type,
        radius_km=radius_km,
        route_getter=route_getter,
        ors_api_key=ors_api_key,
        km_per_liter=km_per_liter,
        liters_to_fill=liters_to_fill,
    )
