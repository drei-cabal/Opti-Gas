import { normalizeMode } from "../shared/formatters.js";
import { state, TANK_STATUS_FRACTIONS } from "../shared/state.js";

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

export function getActiveVehicle() {
  return state.vehicles.find((vehicle) => vehicle.id === state.activeVehicleId) || null;
}

export function hasActiveVehicle() {
  return Boolean(getActiveVehicle());
}

export function isModeLocked(mode) {
  return !hasActiveVehicle() && normalizeMode(mode) !== "save-time";
}
