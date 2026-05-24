import { DEFAULT_CENTER } from "../map.js";
import { state } from "../shared/state.js";

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
};
const LOCATION_REFRESH_DISTANCE_METERS = 75;

const deps = {
  applyLocationFailureMessage: null,
  clearAnnouncement: null,
  mapView: null,
  refreshRecommendations: null,
  render: null,
  resolveLocationFailureMessage: null,
};

let locationWatchId = null;
let lastRecommendationLocation = null;

export function configureLocation(nextDeps) {
  Object.assign(deps, nextDeps);
}

export async function requestLocation({ forceRetry = false } = {}) {
  if (!navigator.geolocation) {
    handleLocationFailure({ reason: "unsupported" });
    return;
  }

  if (!forceRetry && navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      if (status.state === "denied") {
        handleLocationFailure({ reason: "denied" });
        return;
      }
    } catch (error) {
      // Try geolocation directly when the Permissions API is unavailable.
    }
  }

  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
  }

  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      void handleLocationSuccess(position);
    },
    (error) => handleLocationFailure({ error }),
    LOCATION_OPTIONS
  );
}

export function rememberRecommendationLocation(location = state.userLocation) {
  lastRecommendationLocation = location ? { ...location } : null;
}

async function handleLocationSuccess(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const nextLocation = { lat, lng };
  const previousLocation = state.userLocation;
  const shouldRefresh = shouldRefreshForLocation(nextLocation);

  state.userLocation = nextLocation;
  state.locationSource = "gps";
  deps.clearAnnouncement?.();
  deps.mapView?.setUserLocation(lat, lng, { fly: !previousLocation || shouldRefresh });

  if (shouldRefresh) {
    await deps.refreshRecommendations?.({ silent: Boolean(state.candidates.length) });
  } else {
    deps.render?.();
  }
}

function handleLocationFailure({ reason = null, error = null } = {}) {
  state.userLocation = null;
  state.locationSource = null;
  rememberRecommendationLocation(null);
  deps.applyLocationFailureMessage?.(deps.resolveLocationFailureMessage?.(reason, error));
  deps.mapView?.centerMap(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, DEFAULT_CENTER.zoom);
}

function shouldRefreshForLocation(nextLocation) {
  if (!lastRecommendationLocation) {
    return true;
  }

  // Avoid recomputing routes for tiny GPS jitter around the same origin.
  return (
    getDistanceMeters(lastRecommendationLocation, nextLocation) >= LOCATION_REFRESH_DISTANCE_METERS
  );
}

function getDistanceMeters(origin, destination) {
  const earthRadiusMeters = 6371000;
  const originLat = toRadians(origin.lat);
  const destinationLat = toRadians(destination.lat);
  const latDelta = toRadians(destination.lat - origin.lat);
  const lngDelta = toRadians(destination.lng - origin.lng);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}
