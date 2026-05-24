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

// Injects map and rendering dependencies for location behavior.
export function configureLocation(nextDeps) {
  Object.assign(deps, nextDeps);
}

// Starts or restarts the browser geolocation watch.
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

// Stores the origin used for the last recommendation refresh.
export function rememberRecommendationLocation(location = state.userLocation) {
  lastRecommendationLocation = location ? { ...location } : null;
}

// Updates user location and refreshes recommendations when movement matters.
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

// Resets location state and shows the correct location warning.
function handleLocationFailure({ reason = null, error = null } = {}) {
  state.userLocation = null;
  state.locationSource = null;
  rememberRecommendationLocation(null);
  deps.applyLocationFailureMessage?.(deps.resolveLocationFailureMessage?.(reason, error));
  deps.mapView?.centerMap(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, DEFAULT_CENTER.zoom);
}

// Decides whether GPS movement is large enough to recompute routes.
function shouldRefreshForLocation(nextLocation) {
  if (!lastRecommendationLocation) {
    return true;
  }

  // Avoid recomputing routes for tiny GPS jitter around the same origin.
  return (
    getDistanceMeters(lastRecommendationLocation, nextLocation) >= LOCATION_REFRESH_DISTANCE_METERS
  );
}

// Calculates meter distance between two latitude-longitude points.
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

// Converts degree values to radians for distance math.
function toRadians(value) {
  return (value * Math.PI) / 180;
}
