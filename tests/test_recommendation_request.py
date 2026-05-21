from __future__ import annotations

import pytest

from utils.recommendations.requests.parser import (
    normalize_preset,
    parse_recommendation_request,
)


def test_parse_recommendation_request_applies_defaults_and_aliases():
    payload = parse_recommendation_request(
        {
            "lat": "7.44",
            "lng": "125.80",
            "mode": "shortest",
            "brand": " any ",
            "fuel_type": "Unleaded 91",
        }
    )

    assert payload["preset"] == "save-time"
    assert payload["radius_km"] == 5.0
    assert payload["km_per_liter"] > 0
    assert payload["liters_to_fill"] > 0
    assert payload["brand"] == "any"


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("radius_km", "0", "radius_km must be positive"),
        ("km_per_liter", "0", "km_per_liter must be positive"),
        ("liters_to_fill", "0", "liters_to_fill must be positive"),
        ("fuel_type", " ", "fuel_type is required"),
        ("mode", "fastest", "Unsupported preset"),
    ],
)
def test_parse_recommendation_request_rejects_invalid_values(field, value, message):
    request = {
        "lat": "7.44",
        "lng": "125.80",
        field: value,
    }

    with pytest.raises(ValueError, match=message):
        parse_recommendation_request(request)


def test_normalize_preset_keeps_supported_values():
    assert normalize_preset("balanced") == "balanced"
    assert normalize_preset("cheapest") == "save-money"
