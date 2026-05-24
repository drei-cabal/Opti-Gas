import { fetchRecommend } from "../api.js";
import { normalizeMode } from "../shared/formatters.js";
import { persistCachedSession } from "../shared/persistence.js";
import { state } from "../shared/state.js";
import { rememberRecommendationLocation } from "./location.js";

const deps = {
  deriveTripInputs: null,
  getVisibleStations: null,
  isModeLocked: null,
  mapView: null,
  render: null,
  showAnnouncement: null,
  syncFilterControls: null,
};

export function configureRecommendations(nextDeps) {
  Object.assign(deps, nextDeps);
}

export async function refreshRecommendations({ silent = false } = {}) {
  if (!state.userLocation) {
    deps.render?.();
    return;
  }

  const requestMode = deps.isModeLocked?.(state.mode) ? "save-time" : normalizeMode(state.mode);
  if (requestMode !== state.mode) {
    state.mode = requestMode;
    deps.syncFilterControls?.();
  }

  if (!silent) {
    state.isLoadingRecommendations = true;
    deps.render?.();
  }

  try {
    const response = await fetchRecommend(buildRecommendationParams(requestMode));

    state.best = response.best;
    state.candidates = response.candidates;
    state.recommendationReason = response.reason || null;
    rememberRecommendationLocation();

    const visibleStations = deps.getVisibleStations?.() || [];
    if (
      !state.activeStationId ||
      !visibleStations.some((station) => station.station_id === state.activeStationId)
    ) {
      state.activeStationId = visibleStations[0]?.station_id || state.best?.station_id || null;
    }

    persistCachedSession();
    deps.mapView?.renderStations({
      stations: state.allStations,
      candidates: state.candidates,
      best: state.best,
      activeStationId: state.activeStationId,
    });
  } catch (error) {
    deps.showAnnouncement?.(error.message || "Unable to compute the recommendation.", "warning", {
      title: "Recommendation unavailable",
      kind: "system",
    });
  } finally {
    state.isLoadingRecommendations = false;
    deps.render?.();
  }
}

function buildRecommendationParams(requestMode) {
  const params = {
    lat: state.userLocation.lat,
    lng: state.userLocation.lng,
    mode: requestMode,
    brand: state.brand,
    fuel_type: state.fuelType,
    radius_km: state.radiusKm,
  };

  // Garage trip inputs personalize the backend recommendation pipeline.
  const tripInputs = deps.deriveTripInputs?.();
  if (tripInputs) {
    params.km_per_liter = tripInputs.kmPerLiter;
    params.liters_to_fill = tripInputs.litersToFill;
  }

  return params;
}
