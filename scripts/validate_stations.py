from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from utils.data.station_store import StationValidationError, load_stations


def main() -> int:
    stations_path = ROOT_DIR / "data" / "stations" / "stations.json"
    try:
        stations = load_stations(stations_path)
    except (FileNotFoundError, StationValidationError) as exc:
        print(f"Validation failed: {exc}")
        return 1

    print(f"OK: {len(stations)} stations loaded")
    print("OK: All required fields present")
    print("OK: All coordinates within Tagum City bounds")
    print("OK: Duplicate station names are allowed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
