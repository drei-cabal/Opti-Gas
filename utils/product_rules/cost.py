from __future__ import annotations

from statistics import fmean

from utils.product_rules.presets import CANDIDATE_AVERAGE_MIN_COUNT


# Compute the total expected fuel spend for reaching and filling up at a station.
def calculate_economic_cost(
    *,
    distance_km: float,
    km_per_liter: float,
    liters_to_fill: float,
    station_price: float,
    reference_price: float,
) -> dict:
    travel_liters = distance_km / km_per_liter
    purchase_cost = liters_to_fill * station_price
    travel_fuel_cost = travel_liters * reference_price
    economic_cost = purchase_cost + travel_fuel_cost
    return {
        "travel_liters": travel_liters,
        "purchase_cost": purchase_cost,
        "travel_fuel_cost": travel_fuel_cost,
        "economic_cost": economic_cost,
    }


# Choose the fuel price baseline used for travel-cost estimation.
def calculate_reference_price(
    candidates: list[dict],
    all_stations: list[dict],
    fuel_type: str,
) -> tuple[float | None, str | None]:
    candidate_prices = [
        candidate["price"]
        for candidate in candidates
        if candidate["fuel_type"] == fuel_type
    ]
    if len(candidate_prices) >= CANDIDATE_AVERAGE_MIN_COUNT:
        return fmean(candidate_prices), "candidate-average"

    citywide_prices = [
        fuel["price"]
        for station in all_stations
        for fuel in station["fuels"]
        if fuel["fuel_type"] == fuel_type
    ]
    if citywide_prices:
        return fmean(citywide_prices), "citywide-average"

    return None, None

