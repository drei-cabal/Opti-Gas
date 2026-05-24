import { MODE_ALIASES, VALID_MODES, VEHICLE_PRESETS } from "./state.js";

// Formats station price dates for display.
export function formatDate(value) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Formats advisory dates for compact freshness messages.
export function formatAdvisoryDate(value) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// Formats route distance values for station cards.
export function formatDistance(value) {
  return Number(value).toFixed(2);
}

// Formats route duration values for station cards.
export function formatDuration(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

// Normalizes legacy recommendation mode names to current mode names.
export function normalizeMode(value) {
  const normalized = MODE_ALIASES[value] || value || "opti-route";
  return VALID_MODES.has(normalized) ? normalized : "opti-route";
}

// Gets the display label for a vehicle family preset.
export function getFamilyLabel(familyKey) {
  return VEHICLE_PRESETS[familyKey]?.label || "Vehicle";
}

// Gets the display label for a vehicle subtype preset.
export function getSubtypeLabel(familyKey, subtypeKey) {
  return VEHICLE_PRESETS[familyKey]?.subtypes?.[subtypeKey]?.label || "Custom";
}

// Creates a browser-local identifier for saved vehicles.
export function createVehicleId() {
  return `vehicle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Escapes dynamic text before inserting it into HTML strings.
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
