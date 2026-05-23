from __future__ import annotations

from utils.routing import service


def build_station(lat: float = 7.45, lng: float = 125.81) -> dict:
    return {"name": "Estimate Station", "lat": lat, "lng": lng}


def test_get_route_falls_back_to_estimate_when_live_providers_fail(monkeypatch):
    monkeypatch.setattr(service, "fetch_ors_route", lambda *args, **kwargs: None)
    monkeypatch.setattr(service, "fetch_osrm_route", lambda *args, **kwargs: None)

    route = service.get_route(
        (7.44, 125.8),
        build_station(),
        ors_api_key="test-key",
        routing_mode="live",
    )

    assert route["source"] == "estimate"
    assert route["distance_km"] > 0
    assert route["duration_min"] > 0


def test_get_route_estimate_mode_skips_live_providers(monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("Live providers should not run in estimate mode.")

    monkeypatch.setattr(service, "fetch_ors_route", fail_if_called)
    monkeypatch.setattr(service, "fetch_osrm_route", fail_if_called)

    route = service.get_route(
        (7.44, 125.8),
        build_station(lat=7.451, lng=125.811),
        ors_api_key="test-key",
        routing_mode="estimate",
    )

    assert route["source"] == "estimate"
