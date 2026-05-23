from __future__ import annotations

import pytest

from utils.recommendations.filters.brand_filter import filter_by_brand
from utils.recommendations.filters.fuel_filter import find_station_fuel
from utils.recommendations.filters.scoring_filter import compute_final_score
from utils.recommendations.product_rules.cost import (
    calculate_economic_cost,
    calculate_reference_price,
)
from utils.recommendations.product_rules.display import round_distance
from utils.recommendations.product_rules.normalization import normalize_metric


def test_calculate_economic_cost_combines_purchase_and_travel_costs():
    result = calculate_economic_cost(
        distance_km=14,
        km_per_liter=7,
        liters_to_fill=20,
        station_price=60,
        reference_price=55,
    )

    assert result == {
        "travel_liters": 2,
        "purchase_cost": 1200,
        "travel_fuel_cost": 110,
        "economic_cost": 1310,
    }


def test_calculate_reference_price_prefers_candidate_average_when_enough_matches():
    candidates = [
        {"fuel_type": "Diesel", "price": 58.0},
        {"fuel_type": "Diesel", "price": 60.0},
        {"fuel_type": "Diesel", "price": 62.0},
    ]
    all_stations = [
        {
            "fuels": [
                {"fuel_type": "Diesel", "price": 70.0},
            ]
        }
    ]

    price, source = calculate_reference_price(candidates, all_stations, "Diesel")

    assert price == 60.0
    assert source == "candidate-average"


def test_normalize_metric_handles_equal_values_without_division_by_zero():
    assert normalize_metric([5.0, 5.0, 5.0]) == [0.0, 0.0, 0.0]


def test_round_distance_preserves_two_decimal_kilometer_display_precision():
    assert round_distance(1.124) == 1.12
    assert round_distance(1.126) == 1.13
    assert round_distance(0.004) == 0.01


def test_compute_final_score_uses_recommendation_mode_weights():
    candidate = {
        "norm_cost": 0.0,
        "norm_time": 1.0,
        "norm_distance": 1.0,
    }

    assert compute_final_score(candidate, "save-money") == pytest.approx(0.3)
    assert compute_final_score(candidate, "save-time") == pytest.approx(0.9)


def test_filter_by_brand_keeps_any_brand_unrestricted():
    stations = [
        {"brand": "Shell"},
        {"brand": "Petron"},
    ]

    assert filter_by_brand(stations, "any") == stations
    assert filter_by_brand(stations, "shell") == [{"brand": "Shell"}]


def test_find_station_fuel_returns_selected_fuel_type():
    station = {
        "fuels": [
            {"fuel_type": "Unleaded 91", "price": 62.0},
            {"fuel_type": "Diesel", "price": 58.0},
        ]
    }

    assert find_station_fuel(station, "Diesel") == {
        "fuel_type": "Diesel",
        "price": 58.0,
    }
    assert find_station_fuel(station, "Premium 95") is None
