import { elements, state } from "../shared/state.js";
import {
  escapeHtml,
  formatDate,
  formatDistance,
  formatDuration,
} from "../shared/formatters.js";
import { openPriceModal } from "./price-updates.js";
import {
  buildDisplayStation,
  getDisplayStationById,
  getVisibleStations,
} from "./station-search.js";

const deps = {
  getActiveVehicle: null,
  mapView: null,
  openDirections: null,
  render: null,
};
let stationSelectionToken = 0;

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

export function selectStationCard(stationId, { focusMap = true, scroll = true } = {}) {
  if (!stationId) {
    return;
  }

  const selectionToken = ++stationSelectionToken;

  if (state.activeStationId === stationId) {
    deps.render?.();
    if (focusMap) {
      deps.mapView?.focusStation(getDisplayStationById(stationId));
    }
    expandRenderedCard(stationId);
    if (scroll) {
      scrollToStationCard(stationId);
    }
    return;
  }

  const currentCard = getStationCardElement(state.activeStationId);
  if (currentCard) {
    currentCard.dataset.expanded = "false";
    currentCard.classList.remove("active");
    window.setTimeout(() => {
      if (selectionToken !== stationSelectionToken) {
        return;
      }
      commitStationSelection(stationId, { focusMap, scroll });
    }, 220);
    return;
  }

  commitStationSelection(stationId, { focusMap, scroll });
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
          <strong>${station.distance_km != null ? `~${formatDistance(station.distance_km)}km - ~${formatDuration(station.duration_min)} min` : "Set location for route"}</strong>
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

function buildRowMeta(station) {
  if (station.distance_km != null) {
    return `${station.brand} - ~${formatDistance(station.distance_km)}km - ~${formatDuration(
      station.duration_min
    )} min`;
  }
  return `${station.brand} - ${station.available_fuel_types.join(", ")}`;
}

function buildRouteSourceNote(station) {
  if (station.distance_source === "ors") {
    return "Travel time uses live road routing.";
  }
  if (station.distance_source === "osrm") {
    return "Travel time uses live road routing.";
  }
  if (station.distance_source === "estimate") {
    return "Travel time is estimated from straight-line distance.";
  }
  return "Travel time source unavailable.";
}

function getEmptyListMessage() {
  if (state.searchQuery) {
    return "No gas stations match that search.";
  }
  if (state.recommendationReason) {
    return state.recommendationReason;
  }
  if (!state.userLocation) {
    return "Search for a gas station or enable location to see nearby recommendations.";
  }
  return "Stations appear here after location is set.";
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
  if (activeIndex === 0) {
    return stations;
  }

  if (activeIndex === -1) {
    // Show marker-selected stations even when they are outside the current recommendation list.
    const activeStation = buildDisplayStation(
      state.allStations.find((station) => station.station_id === state.activeStationId)
    );
    return activeStation ? [activeStation, ...stations] : stations;
  }

  const ordered = stations.slice();
  const [activeStation] = ordered.splice(activeIndex, 1);
  ordered.unshift(activeStation);
  return ordered;
}

function animateStationToggle(stationId) {
  const currentCard = getStationCardElement(state.activeStationId);

  if (state.activeStationId === stationId) {
    stationSelectionToken += 1;
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

  selectStationCard(stationId);
}

function commitStationSelection(stationId, { focusMap, scroll }) {
  state.activeStationId = stationId;
  deps.render?.();
  if (focusMap) {
    deps.mapView?.focusStation(getDisplayStationById(stationId));
  }
  expandRenderedCard(stationId);
  if (scroll) {
    scrollToStationCard(stationId);
  }
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
  const card = getStationCardElement(stationId);
  if (!card) {
    return;
  }

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  window.setTimeout(() => {
    if (state.activeStationId !== stationId) {
      return;
    }
    getStationCardElement(stationId)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, 240);
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, "\\$&");
}
