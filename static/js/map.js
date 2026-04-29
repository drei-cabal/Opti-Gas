export const DEFAULT_CENTER = {
  lat: 7.4478,
  lng: 125.8079,
  zoom: 14,
};

const TAGUM_BOUNDS = L.latLngBounds(
  [7.38, 125.75],
  [7.51, 125.86]
);

export function createMapView({ onStationSelect }) {
  const map = L.map("map", {
    zoomControl: false,
    preferCanvas: true,
    maxBounds: TAGUM_BOUNDS,
    maxBoundsViscosity: 1.0,
    minZoom: 13,
  }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_CENTER.zoom);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  const stationLayer = L.layerGroup().addTo(map);
  let userMarker = null;
  let userPulse = null;
  let currentUserLocation = null;

  map.fitBounds(TAGUM_BOUNDS);

  function renderStations({ stations, candidates, best, activeStationId }) {
    stationLayer.clearLayers();

    const candidateIds = new Set(candidates.map((station) => station.station_id));

    stations.forEach((station) => {
      const markerState = resolveMarkerState(
        station.station_id,
        candidateIds,
        best?.station_id,
        activeStationId
      );
      const marker = L.marker([station.lat, station.lng], {
        icon: createStationIcon(station.name, markerState),
      });
      marker.on("click", () => onStationSelect(station.station_id));
      marker.addTo(stationLayer);
    });
  }

  function setUserLocation(lat, lng, { fly = true } = {}) {
    currentUserLocation = { lat, lng };
    if (userMarker) {
      userMarker.setLatLng([lat, lng]);
      userPulse.setLatLng([lat, lng]);
    } else {
      userPulse = L.circle([lat, lng], {
        radius: 120,
        color: "#1A73E8",
        weight: 1,
        fillColor: "#1A73E8",
        fillOpacity: 0.12,
      }).addTo(map);
      userMarker = L.circleMarker([lat, lng], {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: "#1A73E8",
        fillOpacity: 1,
      }).addTo(map);
    }

    if (fly) {
      map.flyTo([lat, lng], 15, { duration: 1.1 });
    } else {
      map.setView([lat, lng], 15);
    }
  }

  function focusStation(station) {
    if (!station) {
      return;
    }
    map.flyTo([station.lat, station.lng], 15, { duration: 0.8 });
  }

  function centerMap(lat, lng, zoom = 14) {
    const bounded = clampToTagum(lat, lng);
    map.setView([bounded.lat, bounded.lng], zoom);
  }

  function recenter() {
    if (currentUserLocation) {
      const bounded = clampToTagum(currentUserLocation.lat, currentUserLocation.lng);
      map.flyTo([bounded.lat, bounded.lng], 15, { duration: 0.9 });
      return;
    }
    map.flyTo([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_CENTER.zoom, { duration: 0.9 });
  }

  return {
    centerMap,
    recenter,
    renderStations,
    setUserLocation,
    focusStation,
  };
}

function resolveMarkerState(stationId, candidateIds, bestStationId, activeStationId) {
  if (stationId === activeStationId) {
    return "active";
  }
  if (stationId === bestStationId) {
    return "best";
  }
  if (candidateIds.has(stationId)) {
    return "candidate";
  }
  return "filtered";
}

function createStationIcon(stationName, markerState) {
  const label = getStationLabel(stationName);
  return L.divIcon({
    className: "station-marker-icon",
    html: `<span class="station-marker station-marker--${markerState}">${label}</span>`,
    iconSize: null,
  });
}

function getStationLabel(stationName) {
  const firstWord = String(stationName || "")
    .trim()
    .split(/\s+/)
    .find(Boolean);
  if (!firstWord) {
    return "Gas";
  }
  return firstWord.slice(0, 4);
}

function clampToTagum(lat, lng) {
  const southWest = TAGUM_BOUNDS.getSouthWest();
  const northEast = TAGUM_BOUNDS.getNorthEast();
  return {
    lat: Math.min(Math.max(lat, southWest.lat), northEast.lat),
    lng: Math.min(Math.max(lng, southWest.lng), northEast.lng),
  };
}
