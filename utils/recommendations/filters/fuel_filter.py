from __future__ import annotations  # Enable postponed evaluation of type annotations.


# Keep only stations that sell the selected fuel type before routing or scoring.
def filter_by_fuel(stations: list[dict], fuel_type: str) -> list[dict]:
    return [station for station in stations if find_station_fuel(station, fuel_type)]


# Find the fuel entry on a station that matches the requested fuel type.
def find_station_fuel(station: dict, fuel_type: str) -> dict | None:
    for fuel in station["fuels"]:
        if fuel["fuel_type"] == fuel_type:
            return fuel
    return None
