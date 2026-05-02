import {
  GARAGE_STORAGE_KEY,
  LAST_SESSION_CACHE_KEY,
  MAX_SAVED_VEHICLES,
  SETUP_PROMPT_SESSION_KEY,
  state,
} from "./state.js";
import { normalizeMode } from "./formatters.js";

export function dismissSetupPrompt(markSetupStarted) {
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

export function readSetupPromptDismissed() {
  try {
    const value = window.sessionStorage.getItem(SETUP_PROMPT_SESSION_KEY);
    return value === "dismissed" || value === "started";
  } catch (error) {
    return false;
  }
}

export function hydrateGarageState({ hasCachedSession = false, syncFilterControls, getActiveVehicle } = {}) {
  const cached = readGarageState();
  if (!cached) {
    syncFilterControls?.();
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

export function persistGarageState() {
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

export function readGarageState() {
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

export function hydrateCachedSession(rebindCachedStation) {
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

export function persistCachedSession() {
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

export function readCachedSession() {
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
