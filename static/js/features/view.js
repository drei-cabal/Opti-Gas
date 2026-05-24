import { elements, state } from "../shared/state.js";

const deps = {
  closeSheet: null,
  getActiveVehicle: null,
};

// Injects dependencies used by view switching and setup prompt rendering.
export function configureView(nextDeps) {
  Object.assign(deps, nextDeps);
}

// Shows or hides the Garage setup prompt and backdrop.
export function renderSetupPrompt() {
  const showPrompt =
    state.view === "map" && !deps.getActiveVehicle?.() && !state.setupPromptDismissed;
  elements.setupPromptBackdrop.classList.toggle("hidden", !showPrompt);
  elements.setupPrompt.classList.toggle("hidden", !showPrompt);
}

// Synchronizes Map and Garage view visibility with navigation buttons.
export function renderViewState() {
  const isGarageView = state.view === "garage";
  elements.appShell.dataset.view = state.view;
  const mapElements = [
    elements.topBar,
    elements.map,
    elements.recenterButton,
    elements.bottomSheet,
    elements.emptyState,
  ];

  mapElements.forEach((element) => {
    element.classList.toggle("hidden", isGarageView);
  });
  elements.setupPromptBackdrop.classList.toggle(
    "hidden",
    isGarageView || state.setupPromptDismissed || Boolean(deps.getActiveVehicle?.())
  );
  elements.setupPrompt.classList.toggle(
    "hidden",
    isGarageView || state.setupPromptDismissed || Boolean(deps.getActiveVehicle?.())
  );
  elements.garageView.classList.toggle("hidden", !isGarageView);
  elements.showMapViewButton.classList.toggle("app-nav__button--active", !isGarageView);
  elements.showGarageViewButton.classList.toggle("app-nav__button--active", isGarageView);

  if (isGarageView) {
    deps.closeSheet?.(elements.filterSheet);
    deps.closeSheet?.(elements.priceModal);
    deps.closeSheet?.(elements.creditsModal);
  }
}

// Sets the active app destination to Map and rerenders.
export function openMapView(render) {
  state.view = "map";
  render();
}

// Sets the active app destination to Garage and rerenders.
export function openGarageView(render) {
  state.view = "garage";
  render();
}
