from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from utils.station_store import StationValidationError, update_station_price


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Update a station price in stations.json")
    parser.add_argument("station_name", help="Exact station name to update")
    parser.add_argument("fuel_type", help="Exact fuel type to update")
    parser.add_argument("new_price", type=float, help="New fuel price")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    stations_path = ROOT_DIR / "data" / "stations" / "stations.json"

    try:
        station = update_station_price(
            stations_path,
            station_name=args.station_name,
            fuel_type=args.fuel_type,
            new_price=args.new_price,
        )
    except (FileNotFoundError, KeyError, StationValidationError) as exc:
        print(f"Update failed: {exc}")
        return 1

    updated_fuel = next(
        fuel for fuel in station["fuels"] if fuel["fuel_type"] == args.fuel_type
    )
    print(
        f"Updated {station['name']} - {args.fuel_type} to "
        f"P{updated_fuel['price']:.2f} on {updated_fuel['last_updated']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
