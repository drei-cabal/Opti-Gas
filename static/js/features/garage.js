import { elements, MAX_SAVED_VEHICLES, state, VEHICLE_PRESETS } from "../shared/state.js";
import { createVehicleId, escapeHtml, getFamilyLabel, getSubtypeLabel } from "../shared/formatters.js";
import {
  dismissSetupPrompt,
  hydrateGarageState,
  persistGarageState,
  readSetupPromptDismissed,
} from "../shared/persistence.js";
import { getActiveVehicle } from "./garage-policy.js";

export {
  dismissSetupPrompt,
  hydrateGarageState,
  readSetupPromptDismissed,
};

const deps = {
  closeSheet: null,
  openSheet: null,
  refreshRecommendations: null,
  render: null,
  renderSetupPrompt: null,
  showAnnouncement: null,
  syncFilterControls: null,
};

// Injects app-shell dependencies used by Garage actions.
export function configureGarage(nextDeps) {
  Object.assign(deps, nextDeps);
}

// Renders saved vehicle cards and Garage empty state.
export function renderGarage() {
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

// Initializes vehicle family options in the vehicle form.
export function populateVehicleFamilyOptions() {
  const familyOptions = Object.entries(VEHICLE_PRESETS)
    .map(
      ([familyKey, family]) =>
        `<option value="${familyKey}">${escapeHtml(family.label)}</option>`
    )
    .join("");
  elements.vehicleFamilySelect.innerHTML = familyOptions;
  populateVehicleSubtypeOptions(elements.vehicleFamilySelect.value || Object.keys(VEHICLE_PRESETS)[0]);
}

// Refreshes subtype options when the vehicle family changes.
export function handleVehicleFamilyChange() {
  populateVehicleSubtypeOptions(elements.vehicleFamilySelect.value);
  applySubtypeDefaults();
}

// Applies vehicle preset defaults when subtype changes.
export function handleVehicleSubtypeChange() {
  applySubtypeDefaults();
}

// Opens the vehicle form for creating or editing a Garage vehicle.
export function openVehicleModal(vehicle = null) {
  if (!vehicle && state.vehicles.length >= MAX_SAVED_VEHICLES) {
    deps.showAnnouncement?.("Remove a saved vehicle before adding another one.", "info", {
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
    elements.vehiclePlateNumberInput.value = vehicle.plate_number || "";
    elements.vehicleFamilySelect.value = vehicle.vehicle_family;
    populateVehicleSubtypeOptions(vehicle.vehicle_family);
    elements.vehicleSubtypeSelect.value = vehicle.vehicle_subtype;
    elements.vehicleFuelTypeSelect.value = vehicle.fuel_type;
    elements.vehicleTankCapacityInput.value = String(vehicle.tank_capacity_l);
    elements.vehicleKmPerLiterInput.value = String(vehicle.km_per_liter);
  } else {
    elements.vehicleNicknameInput.value = "";
    elements.vehiclePlateNumberInput.value = "";
    const [defaultFamilyKey] = Object.keys(VEHICLE_PRESETS);
    elements.vehicleFamilySelect.value = defaultFamilyKey;
    populateVehicleSubtypeOptions(defaultFamilyKey);
    elements.vehicleSubtypeSelect.selectedIndex = 0;
    applySubtypeDefaults();
  }
  deps.openSheet?.(elements.vehicleModal);
}

// Validates and persists the vehicle currently shown in the form.
export async function saveVehicleProfile() {
  const nickname = elements.vehicleNicknameInput.value.trim();
  const plateNumber = elements.vehiclePlateNumberInput.value.trim();
  const tankCapacity = Number(elements.vehicleTankCapacityInput.value);
  const kmPerLiter = Number(elements.vehicleKmPerLiterInput.value);

  if (!nickname) {
    deps.showAnnouncement?.("Give this vehicle a nickname before saving it.", "warning", {
      title: "Vehicle nickname required",
      kind: "garage",
    });
    return;
  }
  if (!(tankCapacity > 0)) {
    deps.showAnnouncement?.("Tank capacity must be greater than zero.", "warning", {
      title: "Invalid tank capacity",
      kind: "garage",
    });
    return;
  }
  if (!(kmPerLiter > 0)) {
    deps.showAnnouncement?.("KM per liter must be greater than zero.", "warning", {
      title: "Invalid fuel economy",
      kind: "garage",
    });
    return;
  }
  if (!state.editingVehicleId && state.vehicles.length >= MAX_SAVED_VEHICLES) {
    deps.showAnnouncement?.("Remove a saved vehicle before adding another one.", "info", {
      title: "Garage is full",
      kind: "garage",
    });
    return;
  }

  const existing = state.vehicles.find((vehicle) => vehicle.id === state.editingVehicleId) || null;
  const vehicle = {
    id: existing?.id || createVehicleId(),
    nickname,
    plate_number: plateNumber,
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
  deps.closeSheet?.(elements.vehicleModal);
  deps.syncFilterControls?.();
  renderGarage();
  deps.render?.();
  if (state.userLocation) {
    await deps.refreshRecommendations?.();
  }
}

// Deletes the edited vehicle and repairs active-vehicle state.
export async function deleteVehicleProfile() {
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
  deps.closeSheet?.(elements.vehicleModal);
  deps.syncFilterControls?.();
  renderGarage();
  deps.render?.();
  if (state.userLocation) {
    await deps.refreshRecommendations?.();
  }
}

// Marks one saved vehicle active and refreshes dependent recommendation state.
export async function setActiveVehicle(vehicleId) {
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
  deps.syncFilterControls?.();
  renderGarage();
  deps.render?.();
  if (state.userLocation) {
    await deps.refreshRecommendations?.();
  }
}

// Explains why personalized modes are unavailable before Garage setup.
export function handleLockedModeAttempt() {
  deps.showAnnouncement?.("Add a vehicle in Garage to unlock personalized recommendations.", "info", {
    title: "Garage setup needed",
    kind: "garage",
  });
  if (state.view !== "garage" && !state.setupPromptDismissed) {
    deps.renderSetupPrompt?.();
  }
}

// Builds one saved vehicle card for the Garage list.
function renderGarageVehicleCard(vehicle) {
  const active = vehicle.id === state.activeVehicleId;
  const plateLine = vehicle.plate_number
    ? `<p class="garage-card__line">Plate ${escapeHtml(vehicle.plate_number)}</p>`
    : "";
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
      ${plateLine}
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

// Loads subtype options for the selected vehicle family.
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

// Copies selected subtype defaults into the vehicle form fields.
function applySubtypeDefaults() {
  const defaults = getSelectedSubtypeDefaults();
  if (!defaults) {
    return;
  }
  elements.vehicleFuelTypeSelect.value = defaults.fuelType;
  elements.vehicleTankCapacityInput.value = String(defaults.tankCapacity);
  elements.vehicleKmPerLiterInput.value = String(defaults.kmPerLiter);
}

// Finds the preset defaults for the current family and subtype fields.
function getSelectedSubtypeDefaults() {
  const family = VEHICLE_PRESETS[elements.vehicleFamilySelect.value];
  if (!family) {
    return null;
  }
  return family.subtypes[elements.vehicleSubtypeSelect.value] || null;
}
