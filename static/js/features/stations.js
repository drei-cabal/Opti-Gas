import { updatePrice } from "../api.js";
import { elements, state } from "../shared/state.js";
import {
  escapeHtml,
  formatDate,
  formatDistance,
  formatDuration,
  normalizeMode,
} from "../shared/formatters.js";

const deps = {
  closeSheet: null,
  getActiveVehicle: null,
  mapView: null,
  openDirections: null,
  openSheet: null,
  refreshRecommendations: null,
  render: null,
  showAnnouncement: null,
};

export function configureStations(nextDeps) {
  Object.assign(deps, nextDeps);
}

export function renderCandidates() {
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
      deps.openDirections?.(getDisplayStationById(button.dataset.stationId));
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

export async function submitPriceUpdate() {
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
    deps.closeSheet?.(elements.priceModal);
    await deps.refreshRecommendations?.();
    if (!state.userLocation) {
      deps.render?.();
    }
  } catch (error) {
    deps.showAnnouncement?.(error.message || "Unable to update the price.", "warning", {
      title: "Price update failed",
      kind: "system",
    });
  }
}

export function getPrimaryStation() {
  const visibleStations = getVisibleStations();
  if (state.searchQuery) {
    return getDisplayStationById(state.activeStationId) || visibleStations[0] || null;
  }
  return state.best || visibleStations[0] || null;
}

export function getActiveStation() {
  return getDisplayStationById(state.activeStationId) || getPrimaryStation();
}

export function getDisplayStationById(stationId) {
  if (!stationId) {
    return null;
  }
  return (
    getVisibleStations().find((station) => station.station_id === stationId) ||
    buildDisplayStation(state.allStations.find((station) => station.station_id === stationId))
  );
}

export function getVisibleStations() {
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

export function buildDisplayStation(station, recommendation = null) {
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

export function rebindCachedStation(station) {
  if (!station?.station_id) {
    return null;
  }

  const currentStation =
    state.allStations.find((item) => item.station_id === station.station_id) || null;
  return buildDisplayStation(currentStation, station);
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
  const showPersonalizedCost = Boolean(deps.getActiveVehicle?.());

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
  deps.openSheet?.(elements.priceModal);
}

function sortStationsForSearch(left, right) {
  const leftIsCandidate = state.candidates.some((station) => station.station_id === left.station_id);
  const rightIsCandidate = state.candidates.some((station) => station.station_id === right.station_id);
  if (leftIsCandidate !== rightIsCandidate) {
    return leftIsCandidate ? -1 : 1;
  }
  return left.station_id.localeCompare(right.station_id);
}

export function buildSummaryBadge(station) {
  if (!state.userLocation) {
    return "Awaiting location";
  }
  if (!deps.getActiveVehicle?.() && normalizeMode(state.mode) === "save-time") {
    return "Quickest option";
  }
  return state.searchQuery ? "Station match" : "Best station";
}

export function buildSummaryMeta(station, activeVehicle) {
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
      deps.render?.();
    }, 220);
    return;
  }

  if (currentCard) {
    currentCard.dataset.expanded = "false";
    currentCard.classList.remove("active");
    window.setTimeout(() => {
      state.activeStationId = stationId;
      deps.render?.();
      deps.mapView?.focusStation(getDisplayStationById(stationId));
      expandRenderedCard(stationId);
      scrollToStationCard(stationId);
    }, 220);
    return;
  }

  state.activeStationId = stationId;
  deps.render?.();
  deps.mapView?.focusStation(getDisplayStationById(stationId));
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
