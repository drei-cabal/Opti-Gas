import { fetchLandmarks, fetchRecommend, fetchStations, updatePrice } from "./api.js";
import { createMapView, DEFAULT_CENTER } from "./map.js";

const DEFAULT_KM_PER_LITER = 14;
const DEFAULT_LITERS_TO_FILL = 20;
const LAST_SESSION_CACHE_KEY = "optigas:last-session";

const state = {
  allStations: [],
  candidates: [],
  best: null,
  activeStationId: null,
  searchQuery: "",
  userLocation: null,
  locationSource: null,
  landmarks: [],
  mode: "opti-route",
  brand: "any",
  fuelType: "Unleaded 91",
  radiusKm: 5,
  fallbackWarning: false,
  isLoadingRecommendations: false,
};

const elements = {
  appShell: document.getElementById("appShell"),
  warningBanner: document.getElementById("warningBanner"),
  locationPrompt: document.getElementById("locationPrompt"),
  landmarkPrompt: document.getElementById("landmarkPrompt"),
  recenterButton: document.getElementById("recenterButton"),
  stationSearchInput: document.getElementById("stationSearchInput"),
  clearSearchButton: document.getElementById("clearSearchButton"),
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
  landmarkSheet: document.getElementById("landmarkSheet"),
  landmarkList: document.getElementById("landmarkList"),
  priceModal: document.getElementById("priceModal"),
  priceModalStation: document.getElementById("priceModalStation"),
  priceModalCurrent: document.getElementById("priceModalCurrent"),
  priceInput: document.getElementById("priceInput"),
  submitPriceButton: document.getElementById("submitPriceButton"),
  radiusInput: document.getElementById("radiusInput"),
  radiusValue: document.getElementById("radiusValue"),
  fuelTypeButtons: document.getElementById("fuelTypeButtons"),
  modeButtons: document.getElementById("modeButtons"),
  brandButtons: document.getElementById("brandButtons"),
  applyFiltersButton: document.getElementById("applyFiltersButton"),
  emptyState: document.getElementById("emptyState"),
  expandRadiusButton: document.getElementById("expandRadiusButton"),
  clearBrandButton: document.getElementById("clearBrandButton"),
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

bootstrap();

async function bootstrap() {
  bindEvents();
  syncFilterControls();
  try {
    state.allStations = await fetchStations();
    renderFuelTypeButtons();
    hydrateCachedSession();
    mapView.renderStations({
      stations: state.allStations,
      candidates: state.candidates,
      best: state.best,
      activeStationId: state.activeStationId,
    });
    render();
    if (state.userLocation) {
      mapView.setUserLocation(state.userLocation.lat, state.userLocation.lng);
      void refreshRecommendations({ silent: true });
    } else {
      requestLocation();
    }
  } catch (error) {
    showWarning(error.message || "Unable to load stations.");
  }
}

function bindEvents() {
  elements.showFiltersInline.addEventListener("click", () => openSheet(elements.filterSheet));
  elements.locationPrompt.addEventListener("click", () => requestLocation({ forceRetry: true }));
  elements.landmarkPrompt.addEventListener("click", openLandmarkPicker);
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

  document.querySelectorAll("[data-close-sheet]").forEach((button) => {
    button.addEventListener("click", () => closeById(button.dataset.closeSheet));
  });

  bindChoiceGroup(elements.modeButtons, "mode", "data-mode");
  bindChoiceGroup(elements.brandButtons, "brand", "data-brand");
  bindChoiceGroup(elements.fuelTypeButtons, "fuelType", "data-fuel-type");

  elements.sheetHandle.addEventListener("click", cycleSheetState);
  bindSheetDrag(elements.sheetHandle);
  bindSheetDrag(elements.sheetSummary);
}

function bindSheetDrag(element) {
  if (!element) {
    return;
  }

  element.addEventListener("pointerdown", (event) => {
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
      clearWarning();
      mapView.setUserLocation(lat, lng);
      elements.locationPrompt.classList.add("hidden");
      elements.landmarkPrompt.classList.add("hidden");
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
  elements.locationPrompt.classList.remove("hidden");
  elements.landmarkPrompt.classList.remove("hidden");
  applyLocationFailureMessage(resolveLocationFailureMessage(reason, error));
  mapView.centerMap(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, DEFAULT_CENTER.zoom);
}

async function openLandmarkPicker() {
  try {
    if (!state.landmarks.length) {
      state.landmarks = await fetchLandmarks();
    }

    elements.landmarkList.innerHTML = state.landmarks
      .map(
        (landmark) =>
          `<button class="landmark-row" type="button" data-landmark="${landmark.name}">${landmark.name}</button>`
      )
      .join("");

    elements.landmarkList.querySelectorAll("[data-landmark]").forEach((button) => {
      button.addEventListener("click", async () => {
        const selected = state.landmarks.find(
          (landmark) => landmark.name === button.dataset.landmark
        );
        if (!selected) {
          return;
        }

        state.userLocation = { lat: selected.lat, lng: selected.lng };
        state.locationSource = "landmark";
        clearWarning();
        mapView.setUserLocation(selected.lat, selected.lng);
        elements.locationPrompt.classList.add("hidden");
        closeSheet(elements.landmarkSheet);
        await refreshRecommendations();
      });
    });

    openSheet(elements.landmarkSheet);
  } catch (error) {
    showWarning(error.message || "Unable to load landmarks.");
  }
}

async function refreshRecommendations({ silent = false } = {}) {
  if (!state.userLocation) {
    render();
    return;
  }

  if (!silent) {
    state.isLoadingRecommendations = true;
    render();
  }

  try {
    const response = await fetchRecommend({
      lat: state.userLocation.lat,
      lng: state.userLocation.lng,
      mode: state.mode,
      brand: state.brand,
      fuel_type: state.fuelType,
      radius_km: state.radiusKm,
    });

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
    showWarning(error.message || "Unable to compute the recommendation.");
  } finally {
    state.isLoadingRecommendations = false;
    render();
  }
}

function render() {
  const primary = getPrimaryStation();
  const hasSearch = Boolean(state.searchQuery);
  elements.summaryBadge.textContent = primary
    ? hasSearch
      ? "Station match"
      : "Best station"
    : "Awaiting location";
  elements.summaryTitle.textContent = primary
    ? primary.name
    : "Find the best station near you";
  elements.summaryMeta.textContent = primary
    ? buildSummaryMeta(primary)
    : "Enable GPS or pick a landmark to start routing.";
  elements.summaryDirections.disabled = !(primary && state.userLocation);

  if (state.fallbackWarning) {
    showWarning(
      "Using estimated distances. Fuel prices may change, and you can update them from any station card."
    );
  } else if (
    state.locationSource &&
    elements.warningBanner.textContent ===
      "Using estimated distances. Fuel prices may change, and you can update them from any station card."
  ) {
    clearWarning();
  }

  mapView.renderStations({
    stations: state.allStations,
    candidates: state.candidates,
    best: state.best,
    activeStationId: state.activeStationId,
  });
  renderCandidates();
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
            ${station.name}
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

  return `
    <div class="candidate-detail">
      <div>
        <h3 class="detail-card__title">${station.name}</h3>
        <p class="detail-card__subhead">${station.brand} - ${station.fuel_type}</p>
        <p class="detail-card__price">P${station.price.toFixed(2)} / liter</p>
      </div>
      <div>
        <p class="detail-card__meta">Last updated: ${formatDate(station.last_updated)}</p>
        <p class="detail-card__meta">Available fuels: ${station.available_fuel_types.join(", ")}</p>
        <p class="detail-card__meta">${buildRouteSourceNote(station)}</p>
        ${staleNotice}
      </div>
      <div class="detail-card__stats">
        <div class="stat-card">
          <span>Drive</span>
          <strong>${station.distance_km != null ? `~${formatDistance(station.distance_km)} km - ~${formatDuration(station.duration_min)} min` : "Set location to estimate"}</strong>
        </div>
        <div class="stat-card">
          <span>Trip cost</span>
          <strong>${station.trip_cost != null ? `~P${station.trip_cost.toLocaleString()}` : "Needs route data"}</strong>
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
    showWarning(error.message || "Unable to update the price.");
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
  return getVisibleStations().find((station) => station.station_id === stationId) || buildDisplayStation(
    state.allStations.find((station) => station.station_id === stationId)
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
    trip_cost: null,
    is_stale_price: false,
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

function buildSummaryMeta(station) {
  if (station.distance_km != null) {
    return `P${station.price.toFixed(2)} per liter - ~${formatDistance(station.distance_km)} km - ~${formatDuration(station.duration_min)} min${station.distance_source === "haversine" ? " estimate" : ""}`;
  }
  return `${station.brand} - ${station.fuel_type} - updated ${formatDate(station.last_updated)}`;
}

function buildRowMeta(station) {
  if (station.distance_km != null) {
    return `${station.brand} - ~${formatDistance(station.distance_km)} km - ~${formatDuration(station.duration_min)} min${station.distance_source === "haversine" ? " estimate" : ""}`;
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

function scrollToStationCard(stationId) {
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

function showWarning(message) {
  elements.warningBanner.textContent = message;
  elements.warningBanner.classList.toggle("hidden", !message);
}

function clearWarning() {
  elements.warningBanner.textContent = "";
  elements.warningBanner.classList.add("hidden");
}

function applyLocationFailureMessage({ banner, promptLabel }) {
  showWarning(banner);
  elements.locationPrompt.textContent = promptLabel;
}

function openSheet(element) {
  element.classList.remove("hidden");
}

function closeSheet(element) {
  element.classList.add("hidden");
}

function closeById(sheetId) {
  const element = document.getElementById(sheetId);
  if (element) {
    closeSheet(element);
  }
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
  syncPillGroup(elements.modeButtons, "data-mode", state.mode);
  syncPillGroup(elements.brandButtons, "data-brand", state.brand);
  syncPillGroup(elements.fuelTypeButtons, "data-fuel-type", state.fuelType);
  elements.radiusInput.value = String(state.radiusKm);
  elements.radiusValue.textContent = `${state.radiusKm} km`;
  elements.applyFiltersButton.disabled = state.isLoadingRecommendations;
  elements.applyFiltersButton.textContent = state.isLoadingRecommendations
    ? "Updating..."
    : "Apply Filters";
}

function syncPillGroup(container, attributeName, selectedValue) {
  container.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.getAttribute(attributeName) === selectedValue);
  });
}

function formatDate(value) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDistance(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

function formatDuration(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
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
      return `<button class="choice-pill${activeClass}" data-fuel-type="${fuelType}" type="button">${fuelType}</button>`;
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
      promptLabel: "Try location again",
    };
  }

  const code = error?.code;
  if (reason === "denied" || code === 1) {
    return {
      banner:
        "Location permission is off. Turn on device/browser location access, then tap 'Use my location' again.",
      promptLabel: "Use my location",
    };
  }
  if (code === 3) {
    return {
      banner:
        "Location request timed out. Turn on location, move to a clearer area, then tap 'Use my location' again.",
      promptLabel: "Try location again",
    };
  }
  if (code === 2) {
    return {
      banner:
        "Location is unavailable. Turn on device location services, then tap 'Use my location' again.",
      promptLabel: "Try location again",
    };
  }
  return {
    banner:
      "Unable to get your location. Turn on location access, then tap 'Use my location' again.",
    promptLabel: "Use my location",
  };
}

function hydrateCachedSession() {
  const cached = readCachedSession();
  if (!cached) {
    return;
  }

  state.userLocation = cached.userLocation || null;
  state.locationSource = cached.locationSource || null;
  state.mode = cached.mode || state.mode;
  state.brand = cached.brand || state.brand;
  state.fuelType = cached.fuelType || state.fuelType;
  state.radiusKm = Number(cached.radiusKm || state.radiusKm);
  state.best = rebindCachedStation(cached.best);
  state.candidates = Array.isArray(cached.candidates)
    ? cached.candidates.map(rebindCachedStation).filter(Boolean)
    : [];
  state.activeStationId =
    cached.activeStationId ||
    state.best?.station_id ||
    state.candidates[0]?.station_id ||
    null;

  if (state.userLocation) {
    elements.locationPrompt.classList.add("hidden");
    elements.landmarkPrompt.classList.add("hidden");
  }

  syncFilterControls();
}

function persistCachedSession() {
  if (!state.userLocation || !state.candidates.length) {
    return;
  }

  const payload = {
    userLocation: state.userLocation,
    locationSource: state.locationSource,
    mode: state.mode,
    brand: state.brand,
    fuelType: state.fuelType,
    radiusKm: state.radiusKm,
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
