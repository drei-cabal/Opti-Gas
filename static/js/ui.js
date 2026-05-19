import { fetchRecommend, fetchStations } from "./api.js";
import { createMapView, DEFAULT_CENTER } from "./map.js";
import {
  applyLocationFailureMessage,
  bindAdvisoryDrag,
  clearAnnouncement,
  showAnnouncement,
  syncAdvisories,
  toggleAnnouncement,
  closeAdvisorySheet,
} from "./features/advisories.js";
import { openDirections } from "./features/directions.js";
import {
  deleteVehicleProfile,
  configureGarage,
  deriveTripInputs,
  dismissSetupPrompt,
  getActiveVehicle,
  handleLockedModeAttempt,
  handleVehicleFamilyChange,
  handleVehicleSubtypeChange,
  hydrateGarageState,
  isModeLocked,
  openVehicleModal,
  populateVehicleFamilyOptions,
  readSetupPromptDismissed,
  renderGarage,
  saveVehicleProfile,
} from "./features/garage.js";
import {
  bindChoiceGroup,
  configureFilters,
  renderFuelTypeButtons,
  resolveLocationFailureMessage,
  syncFilterControls,
} from "./features/filters.js";
import {
  bindSheetDrag,
  configureSheets,
  closeById,
  closeSheet,
  openSheet,
  setSheetState,
} from "./features/sheets.js";
import {
  buildSummaryBadge,
  buildSummaryMeta,
  clearPriceModalTarget,
  configureStations,
  getPrimaryStation,
  getVisibleStations,
  rebindCachedStation,
  renderCandidates,
  selectStationCard,
  submitPriceUpdate,
} from "./features/stations.js";
import {
  configureView,
  openGarageView as setGarageView,
  openMapView as setMapView,
  renderSetupPrompt,
  renderViewState,
} from "./features/view.js";
import { normalizeMode } from "./shared/formatters.js";
import { elements, state } from "./shared/state.js";
import {
  hydrateCachedSession,
  persistCachedSession,
} from "./shared/persistence.js";

const mapView = createMapView({
  onStationSelect: (stationId) => {
    setSheetState("expanded");
    selectStationCard(stationId);
  },
});

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
};
const LOCATION_REFRESH_DISTANCE_METERS = 75;

let locationWatchId = null;
let lastRecommendationLocation = null;

configureFilters({
  deriveTripInputs,
  getActiveVehicle,
  isModeLocked,
});

configureSheets({
  closeAdvisorySheet,
  onSheetClose: (element) => {
    if (element === elements.priceModal) {
      clearPriceModalTarget();
    }
  },
});

configureStations({
  closeSheet,
  getActiveVehicle,
  mapView,
  openDirections: (station) => openDirections(station, state.userLocation),
  openSheet,
  refreshRecommendations,
  render,
  showAnnouncement,
});

configureGarage({
  closeSheet,
  openSheet,
  refreshRecommendations,
  render,
  renderSetupPrompt,
  showAnnouncement,
  syncFilterControls,
});

configureView({
  closeSheet,
  getActiveVehicle,
});

bootstrap();

async function bootstrap() {
  bindEvents();
  populateVehicleFamilyOptions();
  syncAdvisories();
  state.setupPromptDismissed = readSetupPromptDismissed();

  try {
    state.allStations = await fetchStations();
    renderFuelTypeButtons();
    const hasCachedSession = hydrateCachedSession(rebindCachedStation);
    hydrateGarageState({ hasCachedSession, syncFilterControls, getActiveVehicle });
    syncFilterControls();
    renderGarage();
    renderViewState();
    render();

    if (state.userLocation) {
      mapView.setUserLocation(state.userLocation.lat, state.userLocation.lng, { fly: false });
    }
    requestLocation({ forceRetry: Boolean(state.userLocation) });
  } catch (error) {
    showAnnouncement(error.message || "Unable to load stations.", "warning", {
      title: "Station data unavailable",
      kind: "system",
    });
  }
}

function bindEvents() {
  elements.announcementButton.addEventListener("click", toggleAnnouncement);
  elements.showFiltersInline.addEventListener("click", () => openSheet(elements.filterSheet));
  elements.recenterButton.addEventListener("click", () => mapView.recenter());
  elements.summaryDirections.addEventListener("click", () =>
    openDirections(getPrimaryStation(), state.userLocation)
  );
  elements.clearSearchButton.addEventListener("click", clearSearch);
  elements.stationSearchInput.addEventListener("input", handleSearchInput);
  elements.applyFiltersButton.addEventListener("click", async () => {
    closeSheet(elements.filterSheet);
    await refreshRecommendations();
  });
  elements.submitPriceButton.addEventListener("click", submitPriceUpdate);
  elements.radiusInput.addEventListener("input", handleRadiusInput);
  elements.expandRadiusButton.addEventListener("click", async () => {
    state.radiusKm = Math.min(state.radiusKm + 5, 20);
    syncFilterControls();
    await refreshRecommendations();
  });
  elements.clearBrandButton.addEventListener("click", async () => {
    state.brand = "any";
    syncFilterControls();
    await refreshRecommendations();
  });
  elements.openGaragePromptButton.addEventListener("click", () => {
    dismissSetupPrompt(true);
    openGarageView();
  });
  elements.dismissSetupPromptButton.addEventListener("click", () => {
    dismissSetupPrompt(false);
    render();
  });
  elements.openGarageInlineButton.addEventListener("click", () => {
    closeSheet(elements.filterSheet);
    openGarageView();
  });
  elements.showMapViewButton.addEventListener("click", openMapView);
  elements.showGarageViewButton.addEventListener("click", openGarageView);
  elements.addVehicleButton.addEventListener("click", () => openVehicleModal());
  elements.openCreditsButton.addEventListener("click", () => openSheet(elements.creditsModal));
  elements.vehicleFamilySelect.addEventListener("change", handleVehicleFamilyChange);
  elements.vehicleSubtypeSelect.addEventListener("change", handleVehicleSubtypeChange);
  elements.saveVehicleButton.addEventListener("click", saveVehicleProfile);
  elements.deleteVehicleButton.addEventListener("click", deleteVehicleProfile);

  document.querySelectorAll("[data-close-sheet]").forEach((button) => {
    button.addEventListener("click", () => closeById(button.dataset.closeSheet));
  });

  bindChoiceGroup(elements.brandButtons, "brand", "data-brand");
  bindChoiceGroup(elements.fuelTypeButtons, "fuelType", "data-fuel-type");
  bindChoiceGroup(elements.tankStatusButtons, "currentTankStatus", "data-tank-status");

  elements.modeButtons.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    const value = normalizeMode(button.dataset.mode);
    if (isModeLocked(value)) {
      handleLockedModeAttempt(value);
      return;
    }

    state.mode = value;
    syncFilterControls();
    await refreshRecommendations();
  });

  bindSheetDrag(elements.sheetHandle);
  bindSheetDrag(elements.sheetSummary);
  bindAdvisoryDrag(elements.advisoryHandle);
  bindAdvisoryDrag(elements.advisoryHeader);
}

function handleSearchInput(event) {
  state.searchQuery = event.target.value.trim();
  elements.clearSearchButton.classList.toggle("hidden", !state.searchQuery);
  const visibleStations = getVisibleStations();
  if (
    state.activeStationId &&
    !visibleStations.some((station) => station.station_id === state.activeStationId)
  ) {
    state.activeStationId = visibleStations[0]?.station_id || null;
  }
  render();
}

function clearSearch() {
  elements.stationSearchInput.value = "";
  state.searchQuery = "";
  elements.clearSearchButton.classList.add("hidden");
  if (!state.activeStationId && state.best) {
    state.activeStationId = state.best.station_id;
  }
  render();
}

function handleRadiusInput(event) {
  state.radiusKm = Number(event.target.value);
  elements.radiusValue.textContent = `${state.radiusKm} km`;
}

async function requestLocation({ forceRetry = false } = {}) {
  if (!navigator.geolocation) {
    handleLocationFailure({ reason: "unsupported" });
    return;
  }

  if (!forceRetry && navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      if (status.state === "denied") {
        handleLocationFailure({ reason: "denied" });
        return;
      }
    } catch (error) {
      // Ignore permissions API failures and try geolocation directly.
    }
  }

  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
  }

  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      void handleLocationSuccess(position);
    },
    (error) => handleLocationFailure({ error }),
    LOCATION_OPTIONS
  );
}

async function handleLocationSuccess(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const nextLocation = { lat, lng };
  const previousLocation = state.userLocation;
  const shouldRefresh = shouldRefreshForLocation(nextLocation);

  state.userLocation = nextLocation;
  state.locationSource = "gps";
  clearAnnouncement();
  mapView.setUserLocation(lat, lng, { fly: !previousLocation || shouldRefresh });

  if (shouldRefresh) {
    await refreshRecommendations({ silent: Boolean(state.candidates.length) });
  } else {
    render();
  }
}

function handleLocationFailure({ reason = null, error = null } = {}) {
  state.userLocation = null;
  state.locationSource = null;
  lastRecommendationLocation = null;
  applyLocationFailureMessage(resolveLocationFailureMessage(reason, error));
  mapView.centerMap(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, DEFAULT_CENTER.zoom);
}

function shouldRefreshForLocation(nextLocation) {
  if (!lastRecommendationLocation) {
    return true;
  }
  return (
    getDistanceMeters(lastRecommendationLocation, nextLocation) >= LOCATION_REFRESH_DISTANCE_METERS
  );
}

function getDistanceMeters(origin, destination) {
  const earthRadiusMeters = 6371000;
  const originLat = toRadians(origin.lat);
  const destinationLat = toRadians(destination.lat);
  const latDelta = toRadians(destination.lat - origin.lat);
  const lngDelta = toRadians(destination.lng - origin.lng);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

async function refreshRecommendations({ silent = false } = {}) {
  if (!state.userLocation) {
    render();
    return;
  }

  const requestMode = isModeLocked(state.mode) ? "save-time" : normalizeMode(state.mode);
  if (requestMode !== state.mode) {
    state.mode = requestMode;
    syncFilterControls();
  }

  if (!silent) {
    state.isLoadingRecommendations = true;
    render();
  }

  try {
    const params = {
      lat: state.userLocation.lat,
      lng: state.userLocation.lng,
      mode: requestMode,
      brand: state.brand,
      fuel_type: state.fuelType,
      radius_km: state.radiusKm,
    };

    const tripInputs = deriveTripInputs();
    if (tripInputs) {
      params.km_per_liter = tripInputs.kmPerLiter;
      params.liters_to_fill = tripInputs.litersToFill;
    }

    const response = await fetchRecommend(params);

    state.best = response.best;
    state.candidates = response.candidates;
    state.fallbackWarning = response.fallback_warning;
    lastRecommendationLocation = { ...state.userLocation };

    const visibleStations = getVisibleStations();
    if (
      !state.activeStationId ||
      !visibleStations.some((station) => station.station_id === state.activeStationId)
    ) {
      state.activeStationId = visibleStations[0]?.station_id || state.best?.station_id || null;
    }

    persistCachedSession();
    mapView.renderStations({
      stations: state.allStations,
      candidates: state.candidates,
      best: state.best,
      activeStationId: state.activeStationId,
    });
  } catch (error) {
    showAnnouncement(error.message || "Unable to compute the recommendation.", "warning", {
      title: "Recommendation unavailable",
      kind: "system",
    });
  } finally {
    state.isLoadingRecommendations = false;
    render();
  }
}

function render() {
  const primary = getPrimaryStation();
  const hasSearch = Boolean(state.searchQuery);
  const activeVehicle = getActiveVehicle();
  elements.summaryBadge.textContent = primary
    ? hasSearch
      ? "Station match"
      : buildSummaryBadge(primary)
    : "Awaiting location";
  elements.summaryTitle.textContent = primary ? primary.name : "Find the best station near you";
  elements.summaryMeta.textContent = primary
    ? buildSummaryMeta(primary, activeVehicle)
    : "Enable GPS to start routing.";
  elements.summaryDirections.disabled = !(primary && state.userLocation);

  if (state.fallbackWarning) {
    showAnnouncement(
      "Using estimated route values. You can still review stations and update prices from any card.",
      "info",
      {
        title: "Results are estimated",
        kind: "fallback",
      }
    );
  } else if (state.locationSource && state.activeAnnouncement?.kind === "fallback") {
    clearAnnouncement();
  }

  mapView.renderStations({
    stations: state.allStations,
    candidates: state.candidates,
    best: state.best,
    activeStationId: state.activeStationId,
  });
  renderCandidates();
  renderGarage();
  renderSetupPrompt();
  renderViewState();
  elements.emptyState.classList.toggle(
    "hidden",
    !(state.userLocation && state.candidates.length === 0)
  );
}

function openMapView() {
  setMapView(render);
}

function openGarageView() {
  setGarageView(render);
}
