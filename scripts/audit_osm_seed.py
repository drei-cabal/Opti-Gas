from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT_DIR / "data" / "stations" / "stations.osm.seed.json"
DEFAULT_OUTPUT = ROOT_DIR / "data" / "stations" / "stations.osm.audit.csv"
DEFAULT_DUPLICATE_DISTANCE_M = 150.0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Audit OSM-seeded station candidates for likely cleanup issues."
    )
    parser.add_argument(
        "--input",
        default=str(DEFAULT_INPUT),
        help="Seed JSON file to audit.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="CSV file to write the audit report to.",
    )
    parser.add_argument(
        "--duplicate-distance-m",
        type=float,
        default=DEFAULT_DUPLICATE_DISTANCE_M,
        help="Distance threshold in meters for likely-duplicate nearby stations.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    try:
        stations = json.loads(input_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"Seed file not found: {input_path}")
        return 1
    except json.JSONDecodeError as exc:
        print(f"Seed file is not valid JSON: {exc}")
        return 1

    findings = build_findings(
        stations=stations,
        duplicate_distance_m=args.duplicate_distance_m,
    )
    write_csv(output_path, findings)

    print(f"Wrote {len(findings)} audit findings to {output_path}")
    if findings:
        print("Top findings:")
        for row in findings[:10]:
            print(
                f"- score={row['score']} | {row['name']} | {row['issue_types']} | "
                f"{row['notes']}"
            )
    else:
        print("No suspicious entries found.")
    return 0


def build_findings(stations: list[dict], duplicate_distance_m: float) -> list[dict]:
    grouped_by_name: dict[str, list[tuple[int, dict]]] = {}
    for index, station in enumerate(stations):
        grouped_by_name.setdefault(normalize_name(station["name"]), []).append((index, station))

    findings: list[dict] = []
    for index, station in enumerate(stations):
        score = 0
        issue_types: list[str] = []
        notes: list[str] = []

        name = station["name"]
        brand = station["brand"]

        if is_unnamed(name):
            score += 90
            issue_types.append("unnamed")
            notes.append("Generated fallback name from OSM; needs manual naming.")

        if brand == "Independent":
            score += 35
            issue_types.append("generic_brand")
            notes.append("Brand could not be confidently inferred from OSM tags.")

        same_name_entries = grouped_by_name.get(normalize_name(name), [])
        if len(same_name_entries) > 1:
            nearest_same_name = nearest_station_distance_m(
                station,
                [other for other_index, other in same_name_entries if other_index != index],
            )
            score += 45
            issue_types.append("duplicate_name")
            if nearest_same_name is not None:
                notes.append(
                    f"Same station name appears {len(same_name_entries)} times; nearest is "
                    f"{nearest_same_name:.0f}m away."
                )
            else:
                notes.append(f"Same station name appears {len(same_name_entries)} times.")

        nearby_name_match = find_nearby_duplicate(stations, index, duplicate_distance_m)
        if nearby_name_match is not None:
            score += 55
            issue_types.append("nearby_duplicate")
            notes.append(
                f"Nearby candidate within {nearby_name_match['distance_m']:.0f}m: "
                f"{nearby_name_match['name']}."
            )

        if has_placeholder_prices(station):
            score += 20
            issue_types.append("placeholder_prices")
            notes.append("Fuel prices are placeholders and must be replaced.")

        if score == 0:
            continue

        findings.append(
            {
                "score": score,
                "name": name,
                "brand": brand,
                "lat": station["lat"],
                "lng": station["lng"],
                "issue_types": ",".join(issue_types),
                "notes": " ".join(notes),
            }
        )

    findings.sort(key=lambda row: (-row["score"], row["name"].lower()))
    return findings


def write_csv(path: Path, rows: list[dict]) -> None:
    fieldnames = ["score", "name", "brand", "lat", "lng", "issue_types", "notes"]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def normalize_name(name: str) -> str:
    return " ".join(name.lower().split())


def is_unnamed(name: str) -> bool:
    return name.startswith("Unnamed Fuel Station")


def has_placeholder_prices(station: dict) -> bool:
    for fuel in station.get("fuels", []):
        if float(fuel["price"]) >= 999.99:
            return True
    return False


def find_nearby_duplicate(
    stations: list[dict],
    index: int,
    duplicate_distance_m: float,
) -> dict | None:
    current = stations[index]
    nearest: dict | None = None

    for other_index, other in enumerate(stations):
        if other_index == index:
            continue
        distance_m = haversine_distance_m(
            current["lat"],
            current["lng"],
            other["lat"],
            other["lng"],
        )
        if distance_m > duplicate_distance_m:
            continue

        same_name = normalize_name(current["name"]) == normalize_name(other["name"])
        same_brand = current["brand"] == other["brand"]
        if not same_name and not same_brand:
            continue

        if nearest is None or distance_m < nearest["distance_m"]:
            nearest = {
                "name": other["name"],
                "distance_m": distance_m,
            }

    return nearest


def nearest_station_distance_m(station: dict, others: list[dict]) -> float | None:
    if not others:
        return None
    return min(
        haversine_distance_m(
            station["lat"],
            station["lng"],
            other["lat"],
            other["lng"],
        )
        for other in others
    )


def haversine_distance_m(
    lat1: float,
    lng1: float,
    lat2: float,
    lng2: float,
) -> float:
    radius_m = 6371000.0
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_m * c


if __name__ == "__main__":
    raise SystemExit(main())
