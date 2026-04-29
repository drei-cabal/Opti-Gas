from __future__ import annotations

import argparse
import json
import re
import sys
from collections import OrderedDict
from datetime import date
from pathlib import Path

import requests


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT_DIR / "data" / "stations" / "stations.osm.seed.json"
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
TAGUM_BBOX = (7.38, 125.75, 7.51, 125.86)
REQUIRED_FUEL_TYPES = ("Unleaded 91", "Premium 95", "Diesel")
KNOWN_BRANDS = OrderedDict(
    [
        ("petron", "Petron"),
        ("shell", "Shell"),
        ("caltex", "Caltex"),
        ("seaoil", "Seaoil"),
        ("phoenix", "Phoenix"),
        ("unioil", "Unioil"),
        ("cleanfuel", "Cleanfuel"),
        ("ptt", "PTT"),
        ("total", "Total"),
        ("flying v", "Flying V"),
        ("jetti", "Jetti"),
        ("nitrofuel", "Nitrofuel"),
    ]
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Seed OPTI-GAS stations from OpenStreetMap fuel-station candidates."
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="Path to write the seed JSON file.",
    )
    parser.add_argument(
        "--placeholder-price",
        type=float,
        default=999.99,
        help="Placeholder price to assign to each required fuel type.",
    )
    parser.add_argument(
        "--bbox",
        nargs=4,
        type=float,
        metavar=("SOUTH", "WEST", "NORTH", "EAST"),
        default=TAGUM_BBOX,
        help="Bounding box to query. Defaults to Tagum City bounds.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=60,
        help="HTTP timeout in seconds.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.placeholder_price <= 0:
        print("placeholder-price must be positive.")
        return 1

    output_path = Path(args.output)
    bbox = tuple(args.bbox)

    try:
        elements = fetch_osm_fuel_candidates(bbox=bbox, timeout_sec=args.timeout)
        stations = transform_candidates(
            elements=elements,
            placeholder_price=args.placeholder_price,
            updated_on=date.today(),
        )
        output_path.write_text(json.dumps(stations, indent=2), encoding="utf-8")
        output_path.write_text(output_path.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    except requests.RequestException as exc:
        print(f"Failed to fetch OSM candidates: {exc}")
        return 1
    except OSError as exc:
        print(f"Failed to write seed file: {exc}")
        return 1

    print(f"Wrote {len(stations)} candidate stations to {output_path}")
    print("Review names, coordinates, and placeholder prices before replacing data/stations/stations.json.")
    return 0


def fetch_osm_fuel_candidates(
    bbox: tuple[float, float, float, float],
    timeout_sec: int,
) -> list[dict]:
    south, west, north, east = bbox
    query = f"""
[out:json][timeout:25];
(
  node["amenity"="fuel"]({south},{west},{north},{east});
  way["amenity"="fuel"]({south},{west},{north},{east});
  relation["amenity"="fuel"]({south},{west},{north},{east});
);
out center tags;
""".strip()
    last_error: requests.RequestException | None = None
    headers = {
        "User-Agent": "Opti-Gas Seeder/1.0 (+https://github.com/openai)",
        "Accept": "application/json,text/plain,*/*",
    }

    for url in OVERPASS_URLS:
        try:
            response = requests.get(
                url,
                params={"data": query},
                headers=headers,
                timeout=timeout_sec,
            )
            response.raise_for_status()
            payload = response.json()
            return payload.get("elements", [])
        except requests.RequestException as exc:
            last_error = exc

    if last_error is not None:
        raise last_error
    return []


def transform_candidates(
    elements: list[dict],
    placeholder_price: float,
    updated_on: date,
) -> list[dict]:
    stations_by_key: OrderedDict[str, dict] = OrderedDict()

    for index, element in enumerate(elements, start=1):
        lat, lng = extract_coordinates(element)
        if lat is None or lng is None:
            continue

        tags = element.get("tags", {})
        name = clean_station_name(tags, index)
        brand = infer_brand(tags, name)
        station = {
            "name": name,
            "brand": brand,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "fuels": [
                {
                    "fuel_type": fuel_type,
                    "price": round(placeholder_price, 2),
                    "last_updated": updated_on.isoformat(),
                }
                for fuel_type in REQUIRED_FUEL_TYPES
            ],
        }

        dedupe_key = make_station_key(name, lat, lng)
        current = stations_by_key.get(dedupe_key)
        if current is None or should_replace_station(current, station):
            stations_by_key[dedupe_key] = station

    return sorted(stations_by_key.values(), key=lambda station: station["name"].lower())


def extract_coordinates(element: dict) -> tuple[float | None, float | None]:
    if "lat" in element and "lon" in element:
        return float(element["lat"]), float(element["lon"])
    center = element.get("center")
    if center and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None, None


def clean_station_name(tags: dict, fallback_index: int) -> str:
    for key in ("name", "brand", "operator"):
        value = str(tags.get(key, "")).strip()
        if value:
            return normalize_spacing(value)
    return f"Unnamed Fuel Station {fallback_index}"


def infer_brand(tags: dict, station_name: str) -> str:
    search_text = " ".join(
        [
            str(tags.get("brand", "")),
            str(tags.get("operator", "")),
            station_name,
        ]
    ).lower()

    for needle, brand in KNOWN_BRANDS.items():
        if needle in search_text:
            return brand

    tag_brand = normalize_spacing(str(tags.get("brand", "")).strip())
    if tag_brand:
        return tag_brand

    operator = normalize_spacing(str(tags.get("operator", "")).strip())
    if operator:
        return operator

    return "Independent"


def normalize_spacing(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def make_station_key(name: str, lat: float, lng: float) -> str:
    return f"{name.lower()}::{round(lat, 4)}::{round(lng, 4)}"


def should_replace_station(existing: dict, candidate: dict) -> bool:
    existing_is_unnamed = existing["name"].startswith("Unnamed Fuel Station")
    candidate_is_unnamed = candidate["name"].startswith("Unnamed Fuel Station")
    return existing_is_unnamed and not candidate_is_unnamed


if __name__ == "__main__":
    raise SystemExit(main())
