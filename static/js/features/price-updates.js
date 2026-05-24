import { updatePrice } from "../api.js";
import { formatDate } from "../shared/formatters.js";
import { elements, state } from "../shared/state.js";

const deps = {
  closeSheet: null,
  openSheet: null,
  refreshRecommendations: null,
  render: null,
  showAnnouncement: null,
};

// Injects sheet and refresh dependencies for price updates.
export function configurePriceUpdates(nextDeps) {
  Object.assign(deps, nextDeps);
}

// Prepares and opens the price update modal for one station fuel record.
export function openPriceModal(station) {
  state.priceUpdateStation = createPriceUpdateTarget(station);
  setPriceUpdateError("");
  setPriceUpdateBusy(false);
  elements.priceModalStation.textContent = `${station.name} - ${station.fuel_type}`;
  elements.priceModalCurrent.textContent = `Current: P${station.price.toFixed(2)} - Reported ${formatDate(
    station.last_updated
  )}`;
  elements.priceInput.value = station.price.toFixed(2);
  deps.openSheet?.(elements.priceModal);
  requestAnimationFrame(() => {
    elements.priceInput.focus({ preventScroll: true });
    elements.priceInput.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  });
}

// Submits the modal price update and refreshes affected station data.
export async function submitPriceUpdate() {
  const station = state.priceUpdateStation;
  if (!station || state.isUpdatingPrice) {
    return;
  }

  setPriceUpdateError("");
  setPriceUpdateBusy(true);

  try {
    const response = await updatePrice({
      station_name: station.name,
      station_id: station.station_id,
      fuel_type: station.fuel_type,
      new_price: Number(elements.priceInput.value),
    });

    const updatedStation = response.station;
    state.allStations = state.allStations.map((item) =>
      item.station_id === updatedStation.station_id ? updatedStation : item
    );
    deps.closeSheet?.(elements.priceModal);
    await deps.refreshRecommendations?.();
    if (!state.userLocation) {
      deps.render?.();
    }
  } catch (error) {
    deps.showAnnouncement?.(error.message || "Unable to update the price.", "warning", {
      title: "Price update failed",
      kind: "system",
    });
    setPriceUpdateError(error.message || "Unable to update the price.");
  } finally {
    setPriceUpdateBusy(false);
  }
}

// Clears price update modal state after close or completion.
export function clearPriceModalTarget() {
  state.priceUpdateStation = null;
  setPriceUpdateError("");
  setPriceUpdateBusy(false);
}

// Captures the station identity and fuel type being updated.
function createPriceUpdateTarget(station) {
  return {
    name: station.name,
    station_id: station.station_id,
    fuel_type: station.fuel_type,
  };
}

// Toggles submit button and input state during price update requests.
function setPriceUpdateBusy(isBusy) {
  state.isUpdatingPrice = isBusy;
  elements.submitPriceButton.disabled = isBusy;
  elements.submitPriceButton.textContent = isBusy ? "Updating..." : "Submit";
  elements.priceInput.disabled = isBusy;
}

// Shows or clears inline price update validation errors.
function setPriceUpdateError(message) {
  if (!elements.priceModalError) {
    return;
  }
  elements.priceModalError.textContent = message;
  elements.priceModalError.classList.toggle("hidden", !message);
}
