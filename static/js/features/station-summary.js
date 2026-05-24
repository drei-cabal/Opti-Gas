import {
  formatDate,
  formatDistance,
  formatDuration,
  normalizeMode,
} from "../shared/formatters.js";
import { state } from "../shared/state.js";

export function buildSummaryBadge(station, activeVehicle) {
  if (!state.userLocation) {
    return "Awaiting location";
  }
  if (station.station_id === state.activeStationId && station.station_id !== state.best?.station_id) {
    return "Selected station";
  }
  if (!activeVehicle && normalizeMode(state.mode) === "save-time") {
    return "Quickest option";
  }
  return state.searchQuery ? "Station match" : "Best station";
}

export function buildSummaryMeta(station, activeVehicle) {
  if (station.distance_km != null) {
    const base = `P${station.price.toFixed(2)} per liter - ~${formatDistance(
      station.distance_km
    )}km - ~${formatDuration(station.duration_min)} min`;
    if (!activeVehicle) {
      return `${base}. Add a vehicle in Garage to unlock personalized recommendations.`;
    }
    return base;
  }
  return `${station.brand} - ${station.fuel_type} - updated ${formatDate(station.last_updated)}`;
}
