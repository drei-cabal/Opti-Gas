from __future__ import annotations  # Enable postponed evaluation of type annotations.


# Keep only stations that match the requested brand unless the request is unrestricted.
def filter_by_brand(stations: list[dict], brand: str) -> list[dict]:
    if not brand or brand.lower() == "any":
        return list(stations)
    expected = brand.strip().lower()
    return [station for station in stations if station["brand"].lower() == expected]
