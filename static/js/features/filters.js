import { elements, state, TANK_STATUS_LABELS } from "../shared/state.js";
import {
  escapeHtml,
  getFamilyLabel,
  getSubtypeLabel,
  normalizeMode,
} from "../shared/formatters.js";

const deps = {
  deriveTripInputs: null,
  getActiveVehicle: null,
  isModeLocked: null,
};

// Injects Garage policy dependencies used by filter rendering.
export function configureFilters(nextDeps) {
  Object.assign(deps, nextDeps);
}

// Connects a segmented choice group to a state key.
export function bindChoiceGroup(container, stateKey, attributeName) {
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

// Synchronizes filter controls with current recommendation and Garage state.
export function syncFilterControls() {
  if (deps.isModeLocked?.(state.mode)) {
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

  const activeVehicle = deps.getActiveVehicle?.();
  elements.modeHelpText.classList.toggle("hidden", Boolean(activeVehicle));
  elements.modeButtons.querySelectorAll("button").forEach((button) => {
    const mode = normalizeMode(button.dataset.mode);
    const locked = deps.isModeLocked?.(mode);
    button.classList.toggle("choice-pill--locked", locked);
    button.setAttribute("aria-disabled", locked ? "true" : "false");
    button.title = locked
      ? "Add a vehicle in Garage to unlock this preset."
      : "";
  });

  if (activeVehicle) {
    const tripInputs = deps.deriveTripInputs?.(activeVehicle, state.currentTankStatus);
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

// Builds fuel-type filter buttons from available station fuel records.
export function renderFuelTypeButtons() {
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

// Maps geolocation failure reasons to user-facing filter copy.
export function resolveLocationFailureMessage(reason, error) {
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

// Applies the active state to one pill-button group.
function syncPillGroup(container, attributeName, selectedValue) {
  const normalizedValue = attributeName === "data-mode" ? normalizeMode(selectedValue) : selectedValue;
  container.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.getAttribute(attributeName) === normalizedValue);
  });
}

// Collects supported fuel types from the station collection.
function getFuelTypesFromStations() {
  const fuelTypes = new Set();
  state.allStations.forEach((station) => {
    station.fuels.forEach((fuel) => fuelTypes.add(fuel.fuel_type));
  });
  return Array.from(fuelTypes).sort();
}
