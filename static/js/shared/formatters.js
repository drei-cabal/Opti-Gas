import { MODE_ALIASES, VALID_MODES, VEHICLE_PRESETS } from "./state.js";

export function formatDate(value) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatAdvisoryDate(value) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDistance(value) {
  return Number(value).toFixed(2);
}

export function formatDuration(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

export function normalizeMode(value) {
  const normalized = MODE_ALIASES[value] || value || "opti-route";
  return VALID_MODES.has(normalized) ? normalized : "opti-route";
}

export function getFamilyLabel(familyKey) {
  return VEHICLE_PRESETS[familyKey]?.label || "Vehicle";
}

export function getSubtypeLabel(familyKey, subtypeKey) {
  return VEHICLE_PRESETS[familyKey]?.subtypes?.[subtypeKey]?.label || "Custom";
}

export function createVehicleId() {
  return `vehicle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
