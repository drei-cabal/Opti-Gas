import { fetchStations } from "./api.js";
import { createMapView } from "./map.js";
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
  dismissSetupPrompt,
  handleLockedModeAttempt,
  handleVehicleFamilyChange,
  handleVehicleSubtypeChange,
  hydrateGarageState,
  openVehicleModal,
  populateVehicleFamilyOptions,
  readSetupPromptDismissed,
  renderGarage,
  saveVehicleProfile,
} from "./features/garage.js";
import { deriveTripInputs, getActiveVehicle, isModeLocked } from "./features/garage-policy.js";
import {
  bindChoiceGroup,
  configureFilters,
  renderFuelTypeButtons,
  resolveLocationFailureMessage,
  syncFilterControls,
} from "./features/filters.js";
import { configureLocation, requestLocation } from "./features/location.js";
import {
  clearPriceModalTarget,
  configurePriceUpdates,
  submitPriceUpdate,
} from "./features/price-updates.js";
import {
  configureRecommendations,
  refreshRecommendations,
} from "./features/recommendations.js";
import {
  bindSheetDrag,
  configureSheets,
  closeById,
  closeSheet,
  openSheet,
  setSheetState,
} from "./features/sheets.js";
import { configureStations, renderCandidates, selectStationCard } from "./features/stations.js";
import {
  getPrimaryStation,
  getVisibleStations,
  rebindCachedStation,
} from "./features/station-search.js";
import { buildSummaryBadge, buildSummaryMeta } from "./features/station-summary.js";
import {
  configureView,
  openGarageView as setGarageView,
  openMapView as setMapView,
  renderSetupPrompt,
  renderViewState,
} from "./features/view.js";
import { normalizeMode } from "./shared/formatters.js";
import { elements, state } from "./shared/state.js";
import { hydrateCachedSession } from "./shared/persistence.js";

const mapView = createMapView({
  onStationSelect: (stationId) => {
    setSheetState("expanded");
    selectStationCard(stationId);
  },
});

configureFilters({
  deriveTripInputs,
  getActiveVehicle,
  isModeLocked,
});

configureLocation({
  applyLocationFailureMessage,
  clearAnnouncement,
  mapView,
  refreshRecommendations,
  render,
  resolveLocationFailureMessage,
});

configureRecommendations({
  deriveTripInputs,
  getVisibleStations,
  isModeLocked,
  mapView,
  render,
  showAnnouncement,
  syncFilterControls,
});

configurePriceUpdates({
  closeSheet,
  openSheet,
  refreshRecommendations,
  render,
  showAnnouncement,
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
  getActiveVehicle,
  mapView,
  openDirections: (station) => openDirections(station, state.userLocation),
  render,
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

// Boots the app by loading stations, hydrating cached state, and starting location watch.
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

// Wires top-level browser events to the feature modules.
function bindEvents() {
  // Wire announcement, filters, map recentering, and directions shortcuts.
  elements.announcementButton.addEventListener("click", toggleAnnouncement);
  elements.showFiltersInline.addEventListener("click", () => openSheet(elements.filterSheet));
  elements.recenterButton.addEventListener("click", () => mapView.recenter());
  elements.summaryDirections.addEventListener("click", () =>
    openDirections(getPrimaryStation(), state.userLocation)
  );

  // Wire station search controls and search-driven sheet resizing.
  elements.clearSearchButton.addEventListener("click", clearSearch);
  elements.stationSearchInput.addEventListener("input", handleSearchInput);

  // Wire recommendation filters and price update submission.
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

  // Wire first-run setup prompt and primary Map/Garage navigation.
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

  // Wire Garage vehicle modal actions and vehicle preset changes.
  elements.addVehicleButton.addEventListener("click", () => openVehicleModal());
  elements.openCreditsButton.addEventListener("click", () => openSheet(elements.creditsModal));
  elements.vehicleFamilySelect.addEventListener("change", handleVehicleFamilyChange);
  elements.vehicleSubtypeSelect.addEventListener("change", handleVehicleSubtypeChange);
  elements.saveVehicleButton.addEventListener("click", saveVehicleProfile);
  elements.deleteVehicleButton.addEventListener("click", deleteVehicleProfile);

  // Wire shared close buttons for sheets and modals.
  document.querySelectorAll("[data-close-sheet]").forEach((button) => {
    button.addEventListener("click", () => closeById(button.dataset.closeSheet));
  });

  // Wire segmented choice groups to shared filter state.
  bindChoiceGroup(elements.brandButtons, "brand", "data-brand");
  bindChoiceGroup(elements.fuelTypeButtons, "fuelType", "data-fuel-type");
  bindChoiceGroup(elements.tankStatusButtons, "currentTankStatus", "data-tank-status");

  // Wire recommendation mode selection and Garage lock handling.
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

  // Wire bottom-sheet and advisory drag handles.
  bindSheetDrag(elements.sheetHandle);
  bindSheetDrag(elements.sheetSummary);
  bindAdvisoryDrag(elements.advisoryHandle);
  bindAdvisoryDrag(elements.advisoryHeader);
}

// Updates station search state and keeps the active station valid.
function handleSearchInput(event) {
  state.searchQuery = event.target.value.trim();
  const isSearching = Boolean(state.searchQuery);
  elements.clearSearchButton.classList.toggle("hidden", !isSearching);
  // Use the full station sheet height so search results and the active summary stay visible.
  setSheetState(isSearching ? "expanded" : "collapsed");

  const visibleStations = getVisibleStations();
  if (
    state.activeStationId &&
    !visibleStations.some((station) => station.station_id === state.activeStationId)
  ) {
    state.activeStationId = visibleStations[0]?.station_id || null;
  }
  render();
}

// Clears station search and returns the station sheet to its default state.
function clearSearch() {
  elements.stationSearchInput.value = "";
  state.searchQuery = "";
  elements.clearSearchButton.classList.add("hidden");
  // Return the station sheet to its default map position after search ends.
  setSheetState("collapsed");
  if (!state.activeStationId && state.best) {
    state.activeStationId = state.best.station_id;
  }
  render();
}

// Updates radius state as the filter slider moves.
function handleRadiusInput(event) {
  state.radiusKm = Number(event.target.value);
  elements.radiusValue.textContent = `${state.radiusKm} km`;
}

// Coordinates app-shell rendering across map, station, Garage, and prompt modules.
function render() {
  renderSummaryLoadingState();

  const primary = getPrimaryStation();
  const hasSearch = Boolean(state.searchQuery);
  const activeVehicle = getActiveVehicle();
  elements.summaryBadge.textContent = primary
    ? hasSearch
      ? "Station match"
      : buildSummaryBadge(primary, activeVehicle)
    : "Awaiting location";
  elements.summaryTitle.textContent = primary ? primary.name : "Find the best station near you";
  elements.summaryMeta.textContent = primary
    ? buildSummaryMeta(primary, activeVehicle)
    : "Enable GPS to start routing.";
  elements.summaryDirections.disabled = !(primary && state.userLocation);

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

// Mirrors recommendation loading state on the summary card for accessibility.
function renderSummaryLoadingState() {
  // Mirror the recommendation refresh state in the main summary card.
  elements.sheetSummary.classList.toggle("sheet-summary--loading", state.isLoadingRecommendations);
  elements.sheetSummary.setAttribute(
    "aria-busy",
    state.isLoadingRecommendations ? "true" : "false"
  );
}

// Switches the shell back to the map view.
function openMapView() {
  setMapView(render);
}

// Switches the shell to the Garage view.
function openGarageView() {
  setGarageView(render);
}
