from __future__ import annotations  # Enable postponed evaluation of type annotations.


# Find the fuel entry on a station that matches the requested fuel type.
def find_station_fuel(station: dict, fuel_type: str) -> dict | None:
    for fuel in station["fuels"]:
        if fuel["fuel_type"] == fuel_type:
            return fuel
    return None
