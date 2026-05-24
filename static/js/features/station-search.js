import Fuse from "https://unpkg.com/fuse.js@7.3.0/dist/fuse.mjs";

import { state } from "../shared/state.js";

const stationSearchIndex = {
  source: null,
  index: null,
};

// Chooses the station shown in the summary card.
export function getPrimaryStation() {
  const visibleStations = getVisibleStations();
  // Keep the summary card aligned with the station the user selected on the map.
  const activeStation = getDisplayStationById(state.activeStationId);
  if (activeStation) {
    return activeStation;
  }

  if (state.searchQuery) {
    return visibleStations[0] || null;
  }
  return state.best || visibleStations[0] || null;
}

// Returns the active station or falls back to the primary station.
export function getActiveStation() {
  return getDisplayStationById(state.activeStationId) || getPrimaryStation();
}

// Finds a display-ready station by station identity.
export function getDisplayStationById(stationId) {
  if (!stationId) {
    return null;
  }

  return (
    getVisibleStations().find((station) => station.station_id === stationId) ||
    buildDisplayStation(state.allStations.find((station) => station.station_id === stationId))
  );
}

// Builds the station list visible under current search and recommendation state.
export function getVisibleStations() {
  const query = state.searchQuery.trim().toLowerCase();
  if (query) {
    const searchMatches = searchStations(query);
    const rankByStationId = new Map(
      searchMatches.map(({ station }, index) => [station.station_id, index])
    );
    return searchMatches
      .map(({ station }) => {
        const recommendation =
          state.candidates.find((item) => item.station_id === station.station_id) ||
          (state.best?.station_id === station.station_id ? state.best : null);
        return buildDisplayStation(station, recommendation);
      })
      .sort((left, right) => sortStationsForSearch(left, right, rankByStationId));
  }

  if (state.candidates.length) {
    return state.candidates;
  }

  return [];
}

// Shapes a raw station record into card-ready display data.
export function buildDisplayStation(station, recommendation = null) {
  if (!station) {
    return null;
  }

  if (recommendation) {
    return recommendation;
  }

  const fuel = station.fuels.find((item) => item.fuel_type === state.fuelType) || station.fuels[0];
  return {
    name: station.name,
    station_id: station.station_id,
    brand: station.brand,
    lat: station.lat,
    lng: station.lng,
    fuel_type: fuel.fuel_type,
    price: Number(fuel.price),
    last_updated: fuel.last_updated,
    available_fuel_types: station.fuels.map((item) => item.fuel_type),
    distance_km: null,
    duration_min: null,
    economic_cost: null,
    trip_cost: null,
    is_stale_price: false,
    primary_reason: null,
    secondary_reasons: [],
    distance_source: null,
  };
}

// Reattaches cached recommendation data to the current station collection.
export function rebindCachedStation(station) {
  if (!station?.station_id) {
    return null;
  }

  const currentStation =
    state.allStations.find((item) => item.station_id === station.station_id) || null;
  return buildDisplayStation(currentStation, station);
}

// Runs Fuse.js search against the current station collection.
function searchStations(query) {
  return getStationSearchIndex()
    .search(query)
    .map((result) => ({ station: result.item }));
}

// Creates or reuses the Fuse.js station search index.
function getStationSearchIndex() {
  if (stationSearchIndex.source !== state.allStations) {
    stationSearchIndex.source = state.allStations;
    stationSearchIndex.index = new Fuse(state.allStations, {
      keys: [
        { name: "name", weight: 0.55 },
        { name: "brand", weight: 0.3 },
        { name: "fuels.fuel_type", weight: 0.15 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 1,
    });
  }
  return stationSearchIndex.index;
}

// Ranks search results with current recommendations before other matches.
function sortStationsForSearch(left, right, rankByStationId) {
  const leftIsCandidate = state.candidates.some((station) => station.station_id === left.station_id);
  const rightIsCandidate = state.candidates.some(
    (station) => station.station_id === right.station_id
  );
  if (leftIsCandidate !== rightIsCandidate) {
    return leftIsCandidate ? -1 : 1;
  }
  if (rankByStationId) {
    return (
      (rankByStationId.get(left.station_id) ?? Number.MAX_SAFE_INTEGER) -
      (rankByStationId.get(right.station_id) ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return left.station_id.localeCompare(right.station_id);
}
