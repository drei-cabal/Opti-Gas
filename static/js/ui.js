import { fetchRecommend, fetchStations, updatePrice } from "./api.js";
import { createMapView, DEFAULT_CENTER } from "./map.js";

const LAST_SESSION_CACHE_KEY = "optigas:last-session";
const GARAGE_STORAGE_KEY = "optigas:garage";
const SETUP_PROMPT_SESSION_KEY = "optigas:setup-prompt-dismissed";
const MODE_ALIASES = {
  shortest: "save-time",
  cheapest: "save-money",
};
const VALID_MODES = new Set(["opti-route", "save-money", "save-time", "balanced"]);
const MAX_SAVED_VEHICLES = 5;
const TANK_STATUS_FRACTIONS = {
  empty: 0.9,
  half: 0.5,
  topping_up: 0.25,
};
const TANK_STATUS_LABELS = {
  empty: "Empty",
  half: "Half",
  topping_up: "Topping Up",
};
const VEHICLE_PRESETS = {
  motorcycle: {
    label: "Motorcycle",
    subtypes: {
      scooter_auto: {
        label: "Scooter / Automatic",
        fuelType: "Unleaded 91",
        tankCapacity: 5.5,
        kmPerLiter: 45,
      },
      underbone_manual: {
        label: "Underbone / Small Manual",
        fuelType: "Unleaded 91",
        tankCapacity: 4,
        kmPerLiter: 50,
      },
      standard_motorcycle: {
        label: "Standard Motorcycle",
        fuelType: "Unleaded 91",
        tankCapacity: 12,
        kmPerLiter: 35,
      },
      big_bike: {
        label: "Big Bike",
        fuelType: "Premium 95",
        tankCapacity: 15,
        kmPerLiter: 20,
      },
    },
  },
  car: {
    label: "Car",
    subtypes: {
      hatchback: {
        label: "Small Car / Hatchback",
        fuelType: "Unleaded 91",
        tankCapacity: 40,
        kmPerLiter: 16,
      },
      sedan: {
        label: "Sedan",
        fuelType: "Unleaded 91",
        tankCapacity: 45,
        kmPerLiter: 13,
      },
      mpv_crossover: {
        label: "MPV / Crossover",
        fuelType: "Unleaded 91",
        tankCapacity: 48,
        kmPerLiter: 11,
      },
      suv_pickup: {
        label: "SUV / Pickup",
        fuelType: "Diesel",
        tankCapacity: 65,
        kmPerLiter: 9.5,
      },
    },
  },
  van_utility: {
    label: "Van / Utility",
    subtypes: {
      passenger_van: {
        label: "Passenger Van",
        fuelType: "Diesel",
        tankCapacity: 60,
        kmPerLiter: 10,
      },
      light_utility_van: {
        label: "Light Utility Van",
        fuelType: "Diesel",
        tankCapacity: 55,
        kmPerLiter: 11,
      },
    },
  },
};

const state = {
  allStations: [],
  candidates: [],
  best: null,
  activeStationId: null,
  searchQuery: "",
  userLocation: null,
  locationSource: null,
  mode: "save-time",
  brand: "any",
  fuelType: "Unleaded 91",
  radiusKm: 5,
  fallbackWarning: false,
  isLoadingRecommendations: false,
  isAnnouncementOpen: false,
  activeAnnouncement: null,
  advisoryItems: [],
  view: "map",
  vehicles: [],
  activeVehicleId: null,
  currentTankStatus: "half",
  setupPromptDismissed: false,
  editingVehicleId: null,
};

const elements = {
  appShell: document.getElementById("appShell"),
  topBar: document.getElementById("topBar"),
  map: document.getElementById("map"),
  announcementButton: document.getElementById("announcementButton"),
  advisorySheet: document.getElementById("advisorySheet"),
  advisoryPanel: document.getElementById("advisoryPanel"),
  advisoryHandle: document.getElementById("advisoryHandle"),
  advisoryHeader: document.getElementById("advisoryHeader"),
  advisoryList: document.getElementById("advisoryList"),
  recenterButton: document.getElementById("recenterButton"),
  stationSearchInput: document.getElementById("stationSearchInput"),
  clearSearchButton: document.getElementById("clearSearchButton"),
  setupPromptBackdrop: document.getElementById("setupPromptBackdrop"),
  setupPrompt: document.getElementById("setupPrompt"),
  openGaragePromptButton: document.getElementById("openGaragePromptButton"),
  dismissSetupPromptButton: document.getElementById("dismissSetupPromptButton"),
  showFiltersInline: document.getElementById("showFiltersInline"),
  bottomSheet: document.getElementById("bottomSheet"),
  sheetHandle: document.getElementById("sheetHandle"),
  sheetSummary: document.querySelector(".sheet-summary"),
  summaryBadge: document.getElementById("summaryBadge"),
  summaryTitle: document.getElementById("summaryTitle"),
  summaryMeta: document.getElementById("summaryMeta"),
  summaryDirections: document.getElementById("summaryDirections"),
  candidateList: document.getElementById("candidateList"),
  filterSheet: document.getElementById("filterSheet"),
  priceModal: document.getElementById("priceModal"),
  priceModalStation: document.getElementById("priceModalStation"),
  priceModalCurrent: document.getElementById("priceModalCurrent"),
  priceInput: document.getElementById("priceInput"),
  submitPriceButton: document.getElementById("submitPriceButton"),
  radiusInput: document.getElementById("radiusInput"),
  radiusValue: document.getElementById("radiusValue"),
  fuelTypeButtons: document.getElementById("fuelTypeButtons"),
  modeButtons: document.getElementById("modeButtons"),
  modeHelpText: document.getElementById("modeHelpText"),
  brandButtons: document.getElementById("brandButtons"),
  applyFiltersButton: document.getElementById("applyFiltersButton"),
  emptyState: document.getElementById("emptyState"),
  expandRadiusButton: document.getElementById("expandRadiusButton"),
  clearBrandButton: document.getElementById("clearBrandButton"),
  vehicleSummaryCard: document.getElementById("vehicleSummaryCard"),
  vehicleSummaryTitle: document.getElementById("vehicleSummaryTitle"),
  vehicleSummaryMeta: document.getElementById("vehicleSummaryMeta"),
  openGarageInlineButton: document.getElementById("openGarageInlineButton"),
  tankStatusButtons: document.getElementById("tankStatusButtons"),
  garageView: document.getElementById("garageView"),
  vehicleCountMeta: document.getElementById("vehicleCountMeta"),
  garageVehicleList: document.getElementById("garageVehicleList"),
  addVehicleButton: document.getElementById("addVehicleButton"),
  openCreditsButton: document.getElementById("openCreditsButton"),
  vehicleModal: document.getElementById("vehicleModal"),
  vehicleModalTitle: document.getElementById("vehicleModalTitle"),
  vehicleNicknameInput: document.getElementById("vehicleNicknameInput"),
  vehicleFamilySelect: document.getElementById("vehicleFamilySelect"),
  vehicleSubtypeSelect: document.getElementById("vehicleSubtypeSelect"),
  vehicleFuelTypeSelect: document.getElementById("vehicleFuelTypeSelect"),
  vehicleTankCapacityInput: document.getElementById("vehicleTankCapacityInput"),
  vehicleKmPerLiterInput: document.getElementById("vehicleKmPerLiterInput"),
  saveVehicleButton: document.getElementById("saveVehicleButton"),
  deleteVehicleButton: document.getElementById("deleteVehicleButton"),
  creditsModal: document.getElementById("creditsModal"),
  showMapViewButton: document.getElementById("showMapViewButton"),
  showGarageViewButton: document.getElementById("showGarageViewButton"),
};

const mapView = createMapView({
  onStationSelect: (stationId) => {
    state.activeStationId = stationId;
    setSheetState("expanded");
    render();
    mapView.focusStation(getActiveStation());
    scrollToStationCard(stationId);
  },
});

let dragStartY = null;
let dragStartState = null;
let dragPointerId = null;
let advisoryDragStartY = null;
let advisoryDragPointerId = null;
let advisoryCloseTimeoutId = null;
let advisoryOpenFrameId = null;

bootstrap();

async function bootstrap() {
  bindEvents();
  populateVehicleFamilyOptions();
  syncAdvisories();
  state.setupPromptDismissed = readSetupPromptDismissed();

  try {
    state.allStations = await fetchStations();
    renderFuelTypeButtons();
    const hasCachedSession = hydrateCachedSession();
    hydrateGarageState({ hasCachedSession });
    syncFilterControls();
    renderGarage();
    renderViewState();
    render();

    if (state.userLocation) {
      mapView.setUserLocation(state.userLocation.lat, state.userLocation.lng);
      void refreshRecommendations({ silent: true });
    } else {
      requestLocation();
    }
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
  elements.summaryDirections.addEventListener("click", () => openDirections(getPrimaryStation()));
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

function bindSheetDrag(element) {
  if (!element) {
    return;
  }

  element.addEventListener("pointerdown", (event) => {
    const interactiveTarget = event.target.closest("button, input, select, textarea, a");
    if (interactiveTarget && interactiveTarget !== element) {
      return;
    }
    dragPointerId = event.pointerId;
    dragStartY = event.clientY;
    dragStartState = elements.bottomSheet.dataset.state;
    elements.bottomSheet.classList.add("dragging");
    if (typeof element.setPointerCapture === "function") {
      element.setPointerCapture(event.pointerId);
    }
  });

  element.addEventListener("pointermove", (event) => {
    if (dragStartY == null || dragPointerId !== event.pointerId) {
      return;
    }
    const deltaY = event.clientY - dragStartY;
    applySheetDrag(deltaY);
  });

  element.addEventListener("pointerup", (event) => {
    if (dragStartY == null || dragPointerId !== event.pointerId) {
      return;
    }
    const deltaY = event.clientY - dragStartY;
    clearSheetDrag();
    setSheetState(resolveDraggedState(dragStartState, deltaY));
  });

  element.addEventListener("pointercancel", () => {
    clearSheetDrag();
  });

}

function bindChoiceGroup(container, stateKey, attributeName) {
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    const value = button.getAttribute(attributeName);
    state[stateKey] = value;
    syncFilterControls();
    if (stateKey === "currentTankStatus" && state.userLocation) {
      void refreshRecommendations();
    }
  });
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

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      state.userLocation = { lat, lng };
      state.locationSource = "gps";
      clearAnnouncement();
      mapView.setUserLocation(lat, lng);
      await refreshRecommendations();
    },
    (error) => handleLocationFailure({ error }),
    {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 60000,
    }
  );
}

function handleLocationFailure({ reason = null, error = null } = {}) {
  state.userLocation = null;
  state.locationSource = null;
  applyLocationFailureMessage(resolveLocationFailureMessage(reason, error));
  mapView.centerMap(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, DEFAULT_CENTER.zoom);
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
  elements.emptyState.classList.toggle("hidden", !(state.userLocation && state.candidates.length === 0));
}

function renderCandidates() {
  if (state.isLoadingRecommendations) {
    elements.candidateList.innerHTML = renderCandidateLoadingState();
    return;
  }

  const visibleStations = prioritizeActiveStation(getVisibleStations());
  if (!visibleStations.length) {
    elements.candidateList.innerHTML = `<p class="station-detail__empty">${getEmptyListMessage()}</p>`;
    return;
  }

  elements.candidateList.innerHTML = visibleStations
    .map((station) => renderStationCard(station))
    .join("");

  elements.candidateList.querySelectorAll("[data-station-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      animateStationToggle(button.dataset.stationToggle);
    });
  });

  elements.candidateList.querySelectorAll("[data-action='directions']").forEach((button) => {
    button.addEventListener("click", () => {
      openDirections(getDisplayStationById(button.dataset.stationId));
    });
  });

  elements.candidateList.querySelectorAll("[data-action='price']").forEach((button) => {
    button.addEventListener("click", () => {
      const station = getDisplayStationById(button.dataset.stationId);
      if (station) {
        openPriceModal(station);
      }
    });
  });
}

function renderStationCard(station) {
  const isActive = station.station_id === state.activeStationId;

  return `
    <article class="candidate-card${isActive ? " active" : ""}" data-station-card="${station.station_id}" data-expanded="${isActive}">
      <button class="candidate-row" type="button" data-station-toggle="${station.station_id}">
        <div>
          <p class="candidate-row__title">
            <span class="marker-chip" style="background:${station.station_id === state.best?.station_id ? "#F59E0B" : "#64748B"}"></span>
            ${escapeHtml(station.name)}
          </p>
          <p class="candidate-row__meta">${buildRowMeta(station)}</p>
        </div>
        <div class="candidate-row__price">P${station.price.toFixed(2)}</div>
        <svg class="candidate-row__chevron" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="m12 15.4-6.7-6.7 1.4-1.4 5.3 5.3 5.3-5.3 1.4 1.4Z" />
        </svg>
      </button>
      <div class="candidate-detail-shell">
        ${renderStationDetail(station)}
      </div>
    </article>
  `;
}

function renderStationDetail(station) {
  const staleNotice = station.is_stale_price
    ? '<p class="detail-card__warning">Price may be outdated.</p>'
    : "";
  const secondaryReasons = Array.isArray(station.secondary_reasons)
    ? station.secondary_reasons
        .map((reason) => `<p class="detail-card__meta">${escapeHtml(reason)}</p>`)
        .join("")
    : "";
  const showPersonalizedCost = Boolean(getActiveVehicle());

  return `
    <div class="candidate-detail">
      <div>
        <h3 class="detail-card__title">${escapeHtml(station.name)}</h3>
        <p class="detail-card__subhead">${escapeHtml(station.brand)} - ${escapeHtml(station.fuel_type)}</p>
        <p class="detail-card__price">P${station.price.toFixed(2)} / liter</p>
        ${station.primary_reason ? `<p class="detail-card__meta">${escapeHtml(station.primary_reason)}</p>` : ""}
      </div>
      <div>
        <p class="detail-card__meta">Last updated: ${formatDate(station.last_updated)}</p>
        <p class="detail-card__meta">Available fuels: ${station.available_fuel_types.map(escapeHtml).join(", ")}</p>
        <p class="detail-card__meta">${escapeHtml(buildRouteSourceNote(station))}</p>
        ${secondaryReasons}
        ${staleNotice}
      </div>
      <div class="detail-card__stats">
        <div class="stat-card">
          <span>Drive</span>
          <strong>${station.distance_km != null ? `~${formatDistance(station.distance_km)} km - ~${formatDuration(station.duration_min)} min` : "Set location to estimate"}</strong>
        </div>
        <div class="stat-card">
          <span>${showPersonalizedCost ? "Est. total cost" : "Personalized cost"}</span>
          <strong>${showPersonalizedCost && station.economic_cost != null ? `~P${station.economic_cost.toLocaleString()}` : "Add vehicle in Garage"}</strong>
        </div>
      </div>
      <div class="detail-card__actions">
        <button
          class="primary-button"
          type="button"
          data-action="directions"
          data-station-id="${station.station_id}"
          ${state.userLocation ? "" : "disabled"}
        >
          Get Directions
        </button>
        <button
          class="ghost-button"
          type="button"
          data-action="price"
          data-station-id="${station.station_id}"
        >
          Update Price
        </button>
      </div>
    </div>
  `;
}

function openPriceModal(station) {
  elements.priceModalStation.textContent = `${station.name} - ${station.fuel_type}`;
  elements.priceModalCurrent.textContent = `Current: P${station.price.toFixed(2)} - Reported ${formatDate(
    station.last_updated
  )}`;
  elements.priceInput.value = station.price.toFixed(2);
  openSheet(elements.priceModal);
}

async function submitPriceUpdate() {
  const station = getActiveStation();
  if (!station) {
    return;
  }

  try {
    const response = await updatePrice({
      station_name: station.name,
      station_id: station.station_id,
      fuel_type: station.fuel_type,
      new_price: Number(elements.priceInput.value),
    });

    const updatedStation = response.station;
    state.allStations = state.allStations.map((item) =>
      item.station_id === updatedStation.station_id ? updatedStation : item
    );
    closeSheet(elements.priceModal);
    await refreshRecommendations();
    if (!state.userLocation) {
      render();
    }
  } catch (error) {
    showAnnouncement(error.message || "Unable to update the price.", "warning", {
      title: "Price update failed",
      kind: "system",
    });
  }
}

function getPrimaryStation() {
  const visibleStations = getVisibleStations();
  if (state.searchQuery) {
    return getDisplayStationById(state.activeStationId) || visibleStations[0] || null;
  }
  return state.best || visibleStations[0] || null;
}

function getActiveStation() {
  return getDisplayStationById(state.activeStationId) || getPrimaryStation();
}

function getDisplayStationById(stationId) {
  if (!stationId) {
    return null;
  }
  return (
    getVisibleStations().find((station) => station.station_id === stationId) ||
    buildDisplayStation(state.allStations.find((station) => station.station_id === stationId))
  );
}

function getVisibleStations() {
  const query = state.searchQuery.trim().toLowerCase();
  if (query) {
    return state.allStations
      .filter((station) => {
        const haystack = `${station.name} ${station.brand}`.toLowerCase();
        return haystack.includes(query);
      })
      .map((station) => {
        const recommendation =
          state.candidates.find((item) => item.station_id === station.station_id) ||
          (state.best?.station_id === station.station_id ? state.best : null);
        return buildDisplayStation(station, recommendation);
      })
      .sort(sortStationsForSearch);
  }

  if (state.candidates.length) {
    return state.candidates;
  }

  return [];
}

function buildDisplayStation(station, recommendation = null) {
  if (!station) {
    return null;
  }

  if (recommendation) {
    return recommendation;
  }

  const fuel = station.fuels.find((item) => item.fuel_type === state.fuelType) || station.fuels[0];
  return {
    name: station.name,
    station_id: station.station_id,
    brand: station.brand,
    lat: station.lat,
    lng: station.lng,
    fuel_type: fuel.fuel_type,
    price: Number(fuel.price),
    last_updated: fuel.last_updated,
    available_fuel_types: station.fuels.map((item) => item.fuel_type),
    distance_km: null,
    duration_min: null,
    economic_cost: null,
    trip_cost: null,
    is_stale_price: false,
    primary_reason: null,
    secondary_reasons: [],
    distance_source: null,
  };
}

function sortStationsForSearch(left, right) {
  const leftIsCandidate = state.candidates.some((station) => station.station_id === left.station_id);
  const rightIsCandidate = state.candidates.some((station) => station.station_id === right.station_id);
  if (leftIsCandidate !== rightIsCandidate) {
    return leftIsCandidate ? -1 : 1;
  }
  return left.station_id.localeCompare(right.station_id);
}

function buildSummaryBadge(station) {
  if (!state.userLocation) {
    return "Awaiting location";
  }
  if (!getActiveVehicle() && normalizeMode(state.mode) === "save-time") {
    return "Quickest option";
  }
  return state.searchQuery ? "Station match" : "Best station";
}

function buildSummaryMeta(station, activeVehicle) {
  if (station.distance_km != null) {
    const base = `P${station.price.toFixed(2)} per liter - ~${formatDistance(
      station.distance_km
    )} km - ~${formatDuration(station.duration_min)} min`;
    if (!activeVehicle) {
      return `${base}. Add a vehicle in Garage to unlock personalized cost-based presets.`;
    }
    return `${base}${station.distance_source === "haversine" ? " estimate" : ""}`;
  }
  return `${station.brand} - ${station.fuel_type} - updated ${formatDate(station.last_updated)}`;
}

function buildRowMeta(station) {
  if (station.distance_km != null) {
    return `${station.brand} - ~${formatDistance(station.distance_km)} km - ~${formatDuration(
      station.duration_min
    )} min${station.distance_source === "haversine" ? " estimate" : ""}`;
  }
  return `${station.brand} - ${station.available_fuel_types.join(", ")}`;
}

function buildRouteSourceNote(station) {
  if (station.distance_source === "ors") {
    return "ETA based on OpenRouteService road routing.";
  }
  if (station.distance_source === "osrm") {
    return "ETA based on OSRM road routing.";
  }
  if (station.distance_source === "haversine") {
    return "ETA estimated from local fallback routing when road-route data is unavailable.";
  }
  return "ETA source unavailable.";
}

function getEmptyListMessage() {
  if (state.searchQuery) {
    return "No gas stations match that search.";
  }
  if (!state.userLocation) {
    return "Search for a gas station or enable location to see nearby recommendations.";
  }
  return "Candidate stations appear here after location is set.";
}

function renderCandidateLoadingState() {
  return `
    <div class="candidate-skeleton" aria-hidden="true">
      <div class="candidate-skeleton__line candidate-skeleton__line--title"></div>
      <div class="candidate-skeleton__line candidate-skeleton__line--meta"></div>
      <div class="candidate-skeleton__price"></div>
    </div>
    <div class="candidate-skeleton" aria-hidden="true">
      <div class="candidate-skeleton__line candidate-skeleton__line--title"></div>
      <div class="candidate-skeleton__line candidate-skeleton__line--meta"></div>
      <div class="candidate-skeleton__price"></div>
    </div>
    <div class="candidate-skeleton" aria-hidden="true">
      <div class="candidate-skeleton__line candidate-skeleton__line--title"></div>
      <div class="candidate-skeleton__line candidate-skeleton__line--meta"></div>
      <div class="candidate-skeleton__price"></div>
    </div>
  `;
}

function prioritizeActiveStation(stations) {
  if (!state.activeStationId) {
    return stations;
  }

  const activeIndex = stations.findIndex((station) => station.station_id === state.activeStationId);
  if (activeIndex <= 0) {
    return stations;
  }

  const ordered = stations.slice();
  const [activeStation] = ordered.splice(activeIndex, 1);
  ordered.unshift(activeStation);
  return ordered;
}

function animateStationToggle(stationId) {
  const currentCard = getStationCardElement(state.activeStationId);

  if (state.activeStationId === stationId) {
    if (currentCard) {
      currentCard.dataset.expanded = "false";
      currentCard.classList.remove("active");
    }
    window.setTimeout(() => {
      state.activeStationId = null;
      render();
    }, 220);
    return;
  }

  if (currentCard) {
    currentCard.dataset.expanded = "false";
    currentCard.classList.remove("active");
    window.setTimeout(() => {
      state.activeStationId = stationId;
      render();
      mapView.focusStation(getDisplayStationById(stationId));
      expandRenderedCard(stationId);
      scrollToStationCard(stationId);
    }, 220);
    return;
  }

  state.activeStationId = stationId;
  render();
  mapView.focusStation(getDisplayStationById(stationId));
  expandRenderedCard(stationId);
  scrollToStationCard(stationId);
}

function expandRenderedCard(stationId) {
  const card = getStationCardElement(stationId);
  if (!card) {
    return;
  }
  card.dataset.expanded = "false";
  window.requestAnimationFrame(() => {
    card.classList.add("active");
    card.dataset.expanded = "true";
  });
}

function getStationCardElement(stationId) {
  if (!stationId) {
    return null;
  }
  return elements.candidateList.querySelector(`[data-station-card="${cssEscape(stationId)}"]`);
}

function scrollToStationCard() {
  return;
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

function openDirections(station) {
  if (!station || !state.userLocation) {
    return;
  }
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${state.userLocation.lat},${state.userLocation.lng}`);
  url.searchParams.set("destination", `${station.lat},${station.lng}`);
  url.searchParams.set("travelmode", "driving");
  window.open(url.toString(), "_blank", "noopener");
}

function showAnnouncement(message, tone = "info", options = {}) {
  state.activeAnnouncement = {
    kind: options.kind || (tone === "warning" ? "location" : "fallback"),
    tone,
    title:
      options.title ||
      (tone === "warning" ? "Location access off" : "Results are estimated"),
    message,
    date: new Date().toISOString().slice(0, 10),
  };
  syncAdvisories();
}

function clearAnnouncement() {
  state.activeAnnouncement = null;
  syncAdvisories();
}

function applyLocationFailureMessage({ banner }) {
  showAnnouncement(banner, "warning", {
    title: "Location access off",
    kind: "location",
  });
}

function toggleAnnouncement() {
  if (state.isAnnouncementOpen) {
    closeAdvisorySheet();
    return;
  }
  renderAdvisories();
  openAdvisorySheet();
  state.isAnnouncementOpen = true;
  elements.announcementButton.setAttribute("aria-expanded", "true");
}

function syncAdvisories() {
  state.advisoryItems = buildAdvisoryItems();
  elements.announcementButton.classList.toggle(
    "announcement-button--empty",
    !state.activeAnnouncement
  );
  elements.announcementButton.setAttribute(
    "aria-expanded",
    state.isAnnouncementOpen ? "true" : "false"
  );
  if (state.isAnnouncementOpen) {
    renderAdvisories();
  }
}

function buildAdvisoryItems() {
  const items = [];
  if (state.activeAnnouncement) {
    items.push({
      badge: state.activeAnnouncement.tone === "warning" ? "Alert" : "Info",
      tone: state.activeAnnouncement.tone,
      date: state.activeAnnouncement.date,
      title: state.activeAnnouncement.title,
      body: state.activeAnnouncement.message,
    });
  }

  items.push({
    badge: "Guide",
    tone: "guide",
    date: "2026-05-01",
    title: "Quick advisory guide",
    body:
      "Use Garage to save a vehicle, then return to Map for personalized cost-based recommendations.",
  });

  return items;
}

function renderAdvisories() {
  elements.advisoryList.innerHTML = state.advisoryItems
    .map(
      (item) => `
        <article class="advisory-card">
          <div class="advisory-card__meta">
            <span class="advisory-card__badge advisory-card__badge--${item.tone}">${escapeHtml(
              item.badge
            )}</span>
            <span>${formatAdvisoryDate(item.date)}</span>
          </div>
          <h3 class="advisory-card__title">${escapeHtml(item.title)}</h3>
          <p class="advisory-card__body">${escapeHtml(item.body)}</p>
        </article>
      `
    )
    .join("");
}

function closeAdvisorySheet() {
  closeAdvisorySheetWithMotion({ fromDrag: false });
}

function closeAdvisorySheetWithMotion({ fromDrag }) {
  if (elements.advisorySheet.classList.contains("hidden")) {
    state.isAnnouncementOpen = false;
    elements.announcementButton.setAttribute("aria-expanded", "false");
    resetAdvisoryDragState();
    return;
  }

  if (advisoryCloseTimeoutId) {
    window.clearTimeout(advisoryCloseTimeoutId);
  }
  if (advisoryOpenFrameId) {
    window.cancelAnimationFrame(advisoryOpenFrameId);
    advisoryOpenFrameId = null;
  }

  elements.advisorySheet.classList.remove("advisory-sheet--preopen");
  state.isAnnouncementOpen = false;
  elements.announcementButton.setAttribute("aria-expanded", "false");
  if (!fromDrag) {
    resetAdvisoryDragState();
    setAdvisoryTranslate(0);
  }

  elements.advisorySheet.classList.remove("advisory-sheet--dragging");
  requestAnimationFrame(() => {
    setAdvisoryTranslate("calc(100% + 24px)");
    setAdvisoryScrimOpacity(0);
  });

  advisoryCloseTimeoutId = window.setTimeout(() => {
    elements.advisorySheet.classList.add("hidden");
    elements.advisorySheet.classList.remove("advisory-sheet--dragging");
    setAdvisoryTranslate("calc(100% + 24px)");
    advisoryCloseTimeoutId = null;
  }, 280);
}

function bindAdvisoryDrag(element) {
  if (!element) {
    return;
  }

  element.addEventListener("pointerdown", (event) => {
    advisoryDragPointerId = event.pointerId;
    advisoryDragStartY = event.clientY;
    elements.advisorySheet.classList.add("advisory-sheet--dragging");
    if (typeof element.setPointerCapture === "function") {
      element.setPointerCapture(event.pointerId);
    }
  });

  element.addEventListener("pointermove", (event) => {
    if (advisoryDragStartY == null || advisoryDragPointerId !== event.pointerId) {
      return;
    }
    const deltaY = Math.max(0, event.clientY - advisoryDragStartY);
    setAdvisoryTranslate(`${deltaY}px`);
  });

  element.addEventListener("pointerup", (event) => {
    if (advisoryDragStartY == null || advisoryDragPointerId !== event.pointerId) {
      return;
    }
    const deltaY = event.clientY - advisoryDragStartY;
    if (deltaY > 80) {
      closeAdvisorySheetWithMotion({ fromDrag: true });
      return;
    }
    clearAdvisoryDrag();
  });

  element.addEventListener("pointercancel", () => {
    clearAdvisoryDrag();
  });
}

function clearAdvisoryDrag() {
  resetAdvisoryDragState();
  setAdvisoryTranslate(0);
}

function openAdvisorySheet() {
  if (advisoryCloseTimeoutId) {
    window.clearTimeout(advisoryCloseTimeoutId);
    advisoryCloseTimeoutId = null;
  }
  if (advisoryOpenFrameId) {
    window.cancelAnimationFrame(advisoryOpenFrameId);
    advisoryOpenFrameId = null;
  }
  resetAdvisoryDragState();
  elements.advisorySheet.classList.remove("hidden");
  elements.advisorySheet.classList.add("advisory-sheet--preopen");
  setAdvisoryTranslate("calc(100% + 24px)");
  setAdvisoryScrimOpacity(0);
  advisoryOpenFrameId = window.requestAnimationFrame(() => {
    advisoryOpenFrameId = window.requestAnimationFrame(() => {
      elements.advisorySheet.classList.remove("advisory-sheet--preopen");
      setAdvisoryTranslate(0);
      setAdvisoryScrimOpacity(1);
      advisoryOpenFrameId = null;
    });
  });
}

function resetAdvisoryDragState() {
  advisoryDragStartY = null;
  advisoryDragPointerId = null;
  elements.advisorySheet.classList.remove("advisory-sheet--dragging");
}

function setAdvisoryTranslate(value) {
  const translateValue = typeof value === "number" ? `${value}px` : value;
  elements.advisoryPanel.style.setProperty("--advisory-translate", translateValue);
  if (typeof value === "number") {
    const panelHeight = elements.advisoryPanel.offsetHeight || 1;
    const progress = Math.max(0, Math.min(1, 1 - value / panelHeight));
    setAdvisoryScrimOpacity(progress);
  }
}

function setAdvisoryScrimOpacity(value) {
  const opacity = typeof value === "number" ? Math.max(0, Math.min(1, value)) : value;
  elements.advisorySheet.style.setProperty("--advisory-scrim-opacity", String(opacity));
}

function openSheet(element) {
  element.classList.remove("hidden");
}

function closeSheet(element) {
  element.classList.add("hidden");
}

function closeById(sheetId) {
  const element = document.getElementById(sheetId);
  if (!element) {
    return;
  }
  if (sheetId === "advisorySheet") {
    closeAdvisorySheet();
    return;
  }
  closeSheet(element);
}

function setSheetState(stateName) {
  elements.bottomSheet.dataset.state = stateName;
  elements.appShell.dataset.sheetState = stateName;
  elements.bottomSheet.style.removeProperty("transform");
}

function cycleSheetState() {
  const current = elements.bottomSheet.dataset.state;
  if (current === "collapsed") {
    setSheetState("half");
  } else if (current === "half") {
    setSheetState("expanded");
  } else {
    setSheetState("collapsed");
  }
}

function resolveDraggedState(startState, deltaY) {
  if (deltaY < -30) {
    return startState === "collapsed" ? "half" : "expanded";
  }
  if (deltaY > 30) {
    return startState === "expanded" ? "half" : "collapsed";
  }
  return startState || "collapsed";
}

function applySheetDrag(deltaY) {
  const resistance = deltaY > 0 ? 1 : 0.85;
  const limitedDelta = clampDragDelta(dragStartState, deltaY / resistance);
  elements.bottomSheet.style.transform = `translateY(${limitedDelta}px)`;
}

function clampDragDelta(startState, deltaY) {
  if (startState === "collapsed") {
    return Math.max(-260, Math.min(24, deltaY));
  }
  if (startState === "half") {
    return Math.max(-260, Math.min(220, deltaY));
  }
  return Math.max(-24, Math.min(320, deltaY));
}

function clearSheetDrag() {
  dragStartY = null;
  dragStartState = null;
  dragPointerId = null;
  elements.bottomSheet.classList.remove("dragging");
  elements.bottomSheet.style.removeProperty("transform");
}

function syncFilterControls() {
  if (isModeLocked(state.mode)) {
    state.mode = "save-time";
  }

  syncPillGroup(elements.modeButtons, "data-mode", state.mode);
  syncPillGroup(elements.brandButtons, "data-brand", state.brand);
  syncPillGroup(elements.fuelTypeButtons, "data-fuel-type", state.fuelType);
  syncPillGroup(elements.tankStatusButtons, "data-tank-status", state.currentTankStatus);

  elements.radiusInput.value = String(state.radiusKm);
  elements.radiusValue.textContent = `${state.radiusKm} km`;
  elements.applyFiltersButton.disabled = state.isLoadingRecommendations;
  elements.applyFiltersButton.textContent = state.isLoadingRecommendations
    ? "Updating..."
    : "Apply Filters";

  const activeVehicle = getActiveVehicle();
  elements.modeHelpText.classList.toggle("hidden", Boolean(activeVehicle));
  elements.modeButtons.querySelectorAll("button").forEach((button) => {
    const mode = normalizeMode(button.dataset.mode);
    const locked = isModeLocked(mode);
    button.classList.toggle("choice-pill--locked", locked);
    button.setAttribute("aria-disabled", locked ? "true" : "false");
    button.title = locked
      ? "Add a vehicle in Garage to unlock this preset."
      : "";
  });

  if (activeVehicle) {
    const tripInputs = deriveTripInputs(activeVehicle, state.currentTankStatus);
    elements.vehicleSummaryTitle.textContent = activeVehicle.nickname;
    elements.vehicleSummaryMeta.textContent = `${getFamilyLabel(
      activeVehicle.vehicle_family
    )} - ${getSubtypeLabel(activeVehicle.vehicle_family, activeVehicle.vehicle_subtype)} - ${
      activeVehicle.fuel_type
    } - ${TANK_STATUS_LABELS[state.currentTankStatus]} tank - ~${tripInputs.litersToFill.toFixed(
      1
    )} L to fill`;
    elements.openGarageInlineButton.textContent = "Manage Garage";
  } else {
    elements.vehicleSummaryTitle.textContent = "No saved vehicle";
    elements.vehicleSummaryMeta.textContent =
      "Save Time is available now. Personalized presets unlock after Garage setup.";
    elements.openGarageInlineButton.textContent = "Open Garage";
  }
}

function syncPillGroup(container, attributeName, selectedValue) {
  const normalizedValue = attributeName === "data-mode" ? normalizeMode(selectedValue) : selectedValue;
  container.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.getAttribute(attributeName) === normalizedValue);
  });
}

function renderSetupPrompt() {
  const showPrompt =
    state.view === "map" && !getActiveVehicle() && !state.setupPromptDismissed;
  elements.setupPromptBackdrop.classList.toggle("hidden", !showPrompt);
  elements.setupPrompt.classList.toggle("hidden", !showPrompt);
}

function renderViewState() {
  const isGarageView = state.view === "garage";
  elements.appShell.dataset.view = state.view;
  const mapElements = [
    elements.topBar,
    elements.map,
    elements.recenterButton,
    elements.bottomSheet,
    elements.emptyState,
  ];

  mapElements.forEach((element) => {
    element.classList.toggle("hidden", isGarageView);
  });
  elements.setupPromptBackdrop.classList.toggle("hidden", isGarageView || state.setupPromptDismissed || hasActiveVehicle());
  elements.setupPrompt.classList.toggle("hidden", isGarageView || state.setupPromptDismissed || hasActiveVehicle());
  elements.garageView.classList.toggle("hidden", !isGarageView);
  elements.showMapViewButton.classList.toggle("app-nav__button--active", !isGarageView);
  elements.showGarageViewButton.classList.toggle("app-nav__button--active", isGarageView);

  if (isGarageView) {
    closeSheet(elements.filterSheet);
    closeSheet(elements.priceModal);
    closeSheet(elements.creditsModal);
  }
}

function openMapView() {
  state.view = "map";
  render();
}

function openGarageView() {
  state.view = "garage";
  render();
}

function renderGarage() {
  elements.vehicleCountMeta.textContent = `${state.vehicles.length} / ${MAX_SAVED_VEHICLES}`;
  elements.addVehicleButton.disabled = state.vehicles.length >= MAX_SAVED_VEHICLES;

  if (!state.vehicles.length) {
    elements.garageVehicleList.innerHTML = `
      <div class="garage-empty garage-empty--centered">
        <div class="garage-empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M5 11h14l-1.3-4.2A3 3 0 0 0 14.8 5H9.2a3 3 0 0 0-2.9 1.8L5 11Zm-.7 2-.3 1.3V18a1 1 0 0 0 1 1h1.5a1 1 0 0 0 1-1v-1h9v1a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1v-3.7l-.3-1.3ZM7.5 14.5A1.5 1.5 0 1 1 6 13a1.5 1.5 0 0 1 1.5 1.5Zm10.5 0A1.5 1.5 0 1 1 16.5 13 1.5 1.5 0 0 1 18 14.5Z" />
          </svg>
        </div>
        <h3>No vehicles yet</h3>
        <p>Add your first vehicle to start using personalized recommendations.</p>
        <button class="primary-button garage-button garage-button--full" type="button" data-garage-action="create">
          Add your first vehicle
        </button>
      </div>
    `;
  } else {
    elements.garageVehicleList.innerHTML = state.vehicles
      .map((vehicle) => renderGarageVehicleCard(vehicle))
      .join("");
  }

  elements.garageVehicleList
    .querySelectorAll("[data-garage-action='activate']")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        await setActiveVehicle(button.dataset.vehicleId);
      });
    });
  elements.garageView.querySelectorAll("[data-garage-action='create']").forEach((button) => {
    button.addEventListener("click", () => openVehicleModal());
  });
  elements.garageVehicleList.querySelectorAll("[data-garage-action='edit']").forEach((button) => {
    button.addEventListener("click", () => {
      const vehicle = state.vehicles.find((item) => item.id === button.dataset.vehicleId);
      if (vehicle) {
        openVehicleModal(vehicle);
      }
    });
  });
}

function renderGarageVehicleCard(vehicle) {
  const active = vehicle.id === state.activeVehicleId;
  return `
    <article class="garage-card${active ? " garage-card--active" : ""}">
      <div class="garage-card__top">
        ${active ? '<div class="garage-card__badge">Active</div>' : '<div class="garage-card__badge garage-card__badge--muted">Saved</div>'}
        <button class="ghost-button garage-button garage-button--subtle" type="button" data-garage-action="edit" data-vehicle-id="${vehicle.id}">
          Edit
        </button>
      </div>
      <h3 class="garage-card__title">${escapeHtml(vehicle.nickname)}</h3>
      <p class="garage-card__line">${escapeHtml(getFamilyLabel(vehicle.vehicle_family))} - ${escapeHtml(
        getSubtypeLabel(vehicle.vehicle_family, vehicle.vehicle_subtype)
      )}</p>
      <p class="garage-card__line">${escapeHtml(vehicle.fuel_type)} - ${vehicle.km_per_liter.toFixed(
        1
      )} km/L - ${vehicle.tank_capacity_l.toFixed(1)} L tank</p>
      <div class="garage-card__actions">
        ${
          active
            ? ""
            : `<button class="primary-button garage-button garage-button--full" type="button" data-garage-action="activate" data-vehicle-id="${vehicle.id}">Set active</button>`
        }
      </div>
    </article>
  `;
}

function populateVehicleFamilyOptions() {
  const familyOptions = Object.entries(VEHICLE_PRESETS)
    .map(
      ([familyKey, family]) =>
        `<option value="${familyKey}">${escapeHtml(family.label)}</option>`
    )
    .join("");
  elements.vehicleFamilySelect.innerHTML = familyOptions;
  populateVehicleSubtypeOptions(elements.vehicleFamilySelect.value || Object.keys(VEHICLE_PRESETS)[0]);
}

function populateVehicleSubtypeOptions(familyKey) {
  const family = VEHICLE_PRESETS[familyKey];
  if (!family) {
    return;
  }

  elements.vehicleSubtypeSelect.innerHTML = Object.entries(family.subtypes)
    .map(
      ([subtypeKey, subtype]) =>
        `<option value="${subtypeKey}">${escapeHtml(subtype.label)}</option>`
    )
    .join("");
}

function handleVehicleFamilyChange() {
  populateVehicleSubtypeOptions(elements.vehicleFamilySelect.value);
  applySubtypeDefaults();
}

function handleVehicleSubtypeChange() {
  applySubtypeDefaults();
}

function applySubtypeDefaults() {
  const defaults = getSelectedSubtypeDefaults();
  if (!defaults) {
    return;
  }
  elements.vehicleFuelTypeSelect.value = defaults.fuelType;
  elements.vehicleTankCapacityInput.value = String(defaults.tankCapacity);
  elements.vehicleKmPerLiterInput.value = String(defaults.kmPerLiter);
}

function getSelectedSubtypeDefaults() {
  const family = VEHICLE_PRESETS[elements.vehicleFamilySelect.value];
  if (!family) {
    return null;
  }
  return family.subtypes[elements.vehicleSubtypeSelect.value] || null;
}

function openVehicleModal(vehicle = null) {
  if (!vehicle && state.vehicles.length >= MAX_SAVED_VEHICLES) {
    showAnnouncement("Remove a saved vehicle before adding another one.", "info", {
      title: "Garage is full",
      kind: "garage",
    });
    return;
  }

  state.editingVehicleId = vehicle?.id || null;
  elements.vehicleModalTitle.textContent = vehicle ? "Edit Vehicle" : "Add Vehicle";
  elements.deleteVehicleButton.classList.toggle("hidden", !vehicle);

  if (vehicle) {
    elements.vehicleNicknameInput.value = vehicle.nickname;
    elements.vehicleFamilySelect.value = vehicle.vehicle_family;
    populateVehicleSubtypeOptions(vehicle.vehicle_family);
    elements.vehicleSubtypeSelect.value = vehicle.vehicle_subtype;
    elements.vehicleFuelTypeSelect.value = vehicle.fuel_type;
    elements.vehicleTankCapacityInput.value = String(vehicle.tank_capacity_l);
    elements.vehicleKmPerLiterInput.value = String(vehicle.km_per_liter);
  } else {
    elements.vehicleNicknameInput.value = "";
    const [defaultFamilyKey] = Object.keys(VEHICLE_PRESETS);
    elements.vehicleFamilySelect.value = defaultFamilyKey;
    populateVehicleSubtypeOptions(defaultFamilyKey);
    elements.vehicleSubtypeSelect.selectedIndex = 0;
    applySubtypeDefaults();
  }
  openSheet(elements.vehicleModal);
}

async function saveVehicleProfile() {
  const nickname = elements.vehicleNicknameInput.value.trim();
  const tankCapacity = Number(elements.vehicleTankCapacityInput.value);
  const kmPerLiter = Number(elements.vehicleKmPerLiterInput.value);

  if (!nickname) {
    showAnnouncement("Give this vehicle a nickname before saving it.", "warning", {
      title: "Vehicle nickname required",
      kind: "garage",
    });
    return;
  }
  if (!(tankCapacity > 0)) {
    showAnnouncement("Tank capacity must be greater than zero.", "warning", {
      title: "Invalid tank capacity",
      kind: "garage",
    });
    return;
  }
  if (!(kmPerLiter > 0)) {
    showAnnouncement("KM per liter must be greater than zero.", "warning", {
      title: "Invalid fuel economy",
      kind: "garage",
    });
    return;
  }
  if (!state.editingVehicleId && state.vehicles.length >= MAX_SAVED_VEHICLES) {
    showAnnouncement("Remove a saved vehicle before adding another one.", "info", {
      title: "Garage is full",
      kind: "garage",
    });
    return;
  }

  const existing = state.vehicles.find((vehicle) => vehicle.id === state.editingVehicleId) || null;
  const vehicle = {
    id: existing?.id || createVehicleId(),
    nickname,
    vehicle_family: elements.vehicleFamilySelect.value,
    vehicle_subtype: elements.vehicleSubtypeSelect.value,
    fuel_type: elements.vehicleFuelTypeSelect.value,
    tank_capacity_l: tankCapacity,
    km_per_liter: kmPerLiter,
    is_active: existing?.id === state.activeVehicleId || (!existing && !state.activeVehicleId),
  };

  if (existing) {
    state.vehicles = state.vehicles.map((item) => (item.id === existing.id ? vehicle : item));
  } else {
    state.vehicles = [...state.vehicles, vehicle];
  }

  if (vehicle.is_active || !state.activeVehicleId) {
    state.activeVehicleId = vehicle.id;
    state.vehicles = state.vehicles.map((item) => ({
      ...item,
      is_active: item.id === vehicle.id,
    }));
    state.fuelType = vehicle.fuel_type;
    dismissSetupPrompt(true);
  }

  persistGarageState();
  closeSheet(elements.vehicleModal);
  syncFilterControls();
  renderGarage();
  render();
  if (state.userLocation) {
    await refreshRecommendations();
  }
}

async function deleteVehicleProfile() {
  if (!state.editingVehicleId) {
    return;
  }

  const deletingActive = state.editingVehicleId === state.activeVehicleId;
  state.vehicles = state.vehicles.filter((vehicle) => vehicle.id !== state.editingVehicleId);
  state.editingVehicleId = null;

  if (deletingActive) {
    const nextActive = state.vehicles[0] || null;
    state.activeVehicleId = nextActive?.id || null;
    state.vehicles = state.vehicles.map((vehicle, index) => ({
      ...vehicle,
      is_active: index === 0,
    }));
    if (nextActive) {
      state.fuelType = nextActive.fuel_type;
    } else {
      state.mode = "save-time";
    }
  }

  persistGarageState();
  closeSheet(elements.vehicleModal);
  syncFilterControls();
  renderGarage();
  render();
  if (state.userLocation) {
    await refreshRecommendations();
  }
}

async function setActiveVehicle(vehicleId) {
  const nextActive = state.vehicles.find((vehicle) => vehicle.id === vehicleId);
  if (!nextActive) {
    return;
  }

  state.activeVehicleId = vehicleId;
  state.vehicles = state.vehicles.map((vehicle) => ({
    ...vehicle,
    is_active: vehicle.id === vehicleId,
  }));
  state.fuelType = nextActive.fuel_type;
  dismissSetupPrompt(true);
  persistGarageState();
  syncFilterControls();
  renderGarage();
  render();
  if (state.userLocation) {
    await refreshRecommendations();
  }
}

function deriveTripInputs(vehicle = getActiveVehicle(), tankStatus = state.currentTankStatus) {
  if (!vehicle) {
    return null;
  }
  const refillFraction = TANK_STATUS_FRACTIONS[tankStatus] ?? TANK_STATUS_FRACTIONS.half;
  return {
    kmPerLiter: Number(vehicle.km_per_liter),
    litersToFill: Number(vehicle.tank_capacity_l) * refillFraction,
  };
}

function getActiveVehicle() {
  return state.vehicles.find((vehicle) => vehicle.id === state.activeVehicleId) || null;
}

function hasActiveVehicle() {
  return Boolean(getActiveVehicle());
}

function isModeLocked(mode) {
  return !hasActiveVehicle() && normalizeMode(mode) !== "save-time";
}

function handleLockedModeAttempt() {
  showAnnouncement("Add a vehicle in Garage to unlock personalized recommendations.", "info", {
    title: "Garage setup needed",
    kind: "garage",
  });
  if (state.view !== "garage" && !state.setupPromptDismissed) {
    renderSetupPrompt();
  }
}

function dismissSetupPrompt(markSetupStarted) {
  state.setupPromptDismissed = true;
  try {
    window.sessionStorage.setItem(
      SETUP_PROMPT_SESSION_KEY,
      markSetupStarted ? "started" : "dismissed"
    );
  } catch (error) {
    // Ignore storage failures.
  }
}

function readSetupPromptDismissed() {
  try {
    const value = window.sessionStorage.getItem(SETUP_PROMPT_SESSION_KEY);
    return value === "dismissed" || value === "started";
  } catch (error) {
    return false;
  }
}

function hydrateGarageState({ hasCachedSession = false } = {}) {
  const cached = readGarageState();
  if (!cached) {
    syncFilterControls();
    return;
  }

  state.vehicles = cached.vehicles.slice(0, MAX_SAVED_VEHICLES);
  const active =
    state.vehicles.find((vehicle) => vehicle.is_active) ||
    state.vehicles.find((vehicle) => vehicle.id === cached.activeVehicleId) ||
    state.vehicles[0] ||
    null;

  state.activeVehicleId = active?.id || null;
  state.vehicles = state.vehicles.map((vehicle) => ({
    ...vehicle,
    is_active: vehicle.id === state.activeVehicleId,
  }));

  if (active) {
    if (!hasCachedSession) {
      state.fuelType = active.fuel_type;
    }
  } else {
    state.mode = "save-time";
  }
}

function persistGarageState() {
  const payload = {
    activeVehicleId: state.activeVehicleId,
    currentTankStatus: state.currentTankStatus,
    vehicles: state.vehicles,
  };

  try {
    window.localStorage.setItem(GARAGE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // Ignore storage failures and keep runtime behavior unchanged.
  }
}

function readGarageState() {
  try {
    const raw = window.localStorage.getItem(GARAGE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.vehicles)) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function hydrateCachedSession() {
  const cached = readCachedSession();
  if (!cached) {
    return false;
  }

  state.userLocation = cached.userLocation || null;
  state.locationSource = cached.locationSource || null;
  state.mode = normalizeMode(cached.mode || state.mode);
  state.brand = cached.brand || state.brand;
  state.fuelType = cached.fuelType || state.fuelType;
  state.radiusKm = Number(cached.radiusKm || state.radiusKm);
  state.currentTankStatus = cached.currentTankStatus || state.currentTankStatus;
  state.best = rebindCachedStation(cached.best);
  state.candidates = Array.isArray(cached.candidates)
    ? cached.candidates.map(rebindCachedStation).filter(Boolean)
    : [];
  state.activeStationId =
    cached.activeStationId ||
    state.best?.station_id ||
    state.candidates[0]?.station_id ||
    null;

  return true;
}

function persistCachedSession() {
  if (!state.userLocation || !state.candidates.length) {
    return;
  }

  const payload = {
    userLocation: state.userLocation,
    locationSource: state.locationSource,
    mode: normalizeMode(state.mode),
    brand: state.brand,
    fuelType: state.fuelType,
    radiusKm: state.radiusKm,
    currentTankStatus: state.currentTankStatus,
    best: state.best,
    candidates: state.candidates,
    activeStationId: state.activeStationId,
    cachedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(LAST_SESSION_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    // Ignore storage failures and keep runtime behavior unchanged.
  }
}

function readCachedSession() {
  try {
    const raw = window.localStorage.getItem(LAST_SESSION_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function rebindCachedStation(station) {
  if (!station?.station_id) {
    return null;
  }

  const currentStation =
    state.allStations.find((item) => item.station_id === station.station_id) || null;
  return buildDisplayStation(currentStation, station);
}

function renderFuelTypeButtons() {
  const fuelTypes = getFuelTypesFromStations();
  if (!fuelTypes.length) {
    elements.fuelTypeButtons.innerHTML = "";
    return;
  }

  if (!fuelTypes.includes(state.fuelType)) {
    state.fuelType = fuelTypes[0];
  }

  elements.fuelTypeButtons.innerHTML = fuelTypes
    .map((fuelType) => {
      const activeClass = fuelType === state.fuelType ? " active" : "";
      return `<button class="choice-pill${activeClass}" data-fuel-type="${escapeHtml(
        fuelType
      )}" type="button">${escapeHtml(fuelType)}</button>`;
    })
    .join("");
}

function getFuelTypesFromStations() {
  const fuelTypes = new Set();
  state.allStations.forEach((station) => {
    station.fuels.forEach((fuel) => fuelTypes.add(fuel.fuel_type));
  });
  return Array.from(fuelTypes).sort();
}

function resolveLocationFailureMessage(reason, error) {
  if (reason === "unsupported") {
    return {
      banner: "This browser does not support location access. Use a landmark instead.",
    };
  }

  const code = error?.code;
  if (reason === "denied" || code === 1) {
    return {
      banner:
        "Location permission is off. Turn on device/browser location access, then tap 'Use my location' again.",
    };
  }
  if (code === 3) {
    return {
      banner:
        "Location request timed out. Turn on location, move to a clearer area, then tap 'Use my location' again.",
    };
  }
  if (code === 2) {
    return {
      banner:
        "Location is unavailable. Turn on device location services, then tap 'Use my location' again.",
    };
  }
  return {
    banner:
      "Unable to get your location. Turn on location access, then tap 'Use my location' again.",
  };
}

function formatDate(value) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatAdvisoryDate(value) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDistance(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

function formatDuration(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

function normalizeMode(value) {
  const normalized = MODE_ALIASES[value] || value || "opti-route";
  return VALID_MODES.has(normalized) ? normalized : "opti-route";
}

function getFamilyLabel(familyKey) {
  return VEHICLE_PRESETS[familyKey]?.label || "Vehicle";
}

function getSubtypeLabel(familyKey, subtypeKey) {
  return VEHICLE_PRESETS[familyKey]?.subtypes?.[subtypeKey]?.label || "Custom";
}

function createVehicleId() {
  return `vehicle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
