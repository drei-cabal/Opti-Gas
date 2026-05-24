import { normalizeMode } from "../shared/formatters.js";
import { state, TANK_STATUS_FRACTIONS } from "../shared/state.js";

// Derives recommendation trip inputs from the active vehicle and tank status.
export function deriveTripInputs(vehicle = getActiveVehicle(), tankStatus = state.currentTankStatus) {
  if (!vehicle) {
    return null;
  }

  const refillFraction = TANK_STATUS_FRACTIONS[tankStatus] ?? TANK_STATUS_FRACTIONS.half;
  return {
    kmPerLiter: Number(vehicle.km_per_liter),
    litersToFill: Number(vehicle.tank_capacity_l) * refillFraction,
  };
}

// Returns the currently active saved vehicle, if one exists.
export function getActiveVehicle() {
  return state.vehicles.find((vehicle) => vehicle.id === state.activeVehicleId) || null;
}

// Reports whether Garage has an active vehicle for personalized modes.
export function hasActiveVehicle() {
  return Boolean(getActiveVehicle());
}

// Determines whether a recommendation mode is locked without Garage setup.
export function isModeLocked(mode) {
  return !hasActiveVehicle() && normalizeMode(mode) !== "save-time";
}
