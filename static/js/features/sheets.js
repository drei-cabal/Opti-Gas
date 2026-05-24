import { elements } from "../shared/state.js";

const deps = {
  closeAdvisorySheet: null,
  onSheetClose: null,
};

// Injects callbacks used by sheet close behavior.
export function configureSheets(nextDeps) {
  Object.assign(deps, nextDeps);
}

let dragStartY = null;
let dragStartState = null;
let dragPointerId = null;

// Attaches drag gestures to bottom-sheet handles.
export function bindSheetDrag(element) {
  if (!element) {
    return;
  }

  element.addEventListener("pointerdown", (event) => {
    const interactiveTarget = event.target.closest("button, input, select, textarea, a");
    if (interactiveTarget && interactiveTarget !== element) {
      return;
    }
    dragPointerId = event.pointerId;
    dragStartY = event.clientY;
    dragStartState = elements.bottomSheet.dataset.state;
    elements.bottomSheet.classList.add("dragging");
    if (typeof element.setPointerCapture === "function") {
      element.setPointerCapture(event.pointerId);
    }
  });

  element.addEventListener("pointermove", (event) => {
    if (dragStartY == null || dragPointerId !== event.pointerId) {
      return;
    }
    const deltaY = event.clientY - dragStartY;
    applySheetDrag(deltaY);
  });

  element.addEventListener("pointerup", (event) => {
    if (dragStartY == null || dragPointerId !== event.pointerId) {
      return;
    }
    const deltaY = event.clientY - dragStartY;
    clearSheetDrag();
    setSheetState(resolveDraggedState(dragStartState, deltaY));
  });

  element.addEventListener("pointercancel", () => {
    clearSheetDrag();
  });
}

// Opens a sheet or modal element.
export function openSheet(element) {
  element.classList.remove("hidden");
}

// Closes a sheet or modal element and runs close side effects.
export function closeSheet(element) {
  element.classList.add("hidden");
  deps.onSheetClose?.(element);
}

// Finds a sheet by id and closes it.
export function closeById(sheetId) {
  const element = document.getElementById(sheetId);
  if (!element) {
    return;
  }
  if (sheetId === "advisorySheet") {
    deps.closeAdvisorySheet?.();
    return;
  }
  closeSheet(element);
}

// Sets the main bottom-sheet height state.
export function setSheetState(stateName) {
  elements.bottomSheet.dataset.state = stateName;
  elements.appShell.dataset.sheetState = stateName;
  elements.bottomSheet.style.removeProperty("transform");
}

// Cycles the bottom sheet through collapsed, half, and expanded states.
export function cycleSheetState() {
  const current = elements.bottomSheet.dataset.state;
  if (current === "collapsed") {
    setSheetState("half");
  } else if (current === "half") {
    setSheetState("expanded");
  } else {
    setSheetState("collapsed");
  }
}

// Chooses the next sheet state from a drag distance.
function resolveDraggedState(startState, deltaY) {
  if (deltaY < -30) {
    return startState === "collapsed" ? "half" : "expanded";
  }
  if (deltaY > 30) {
    return startState === "expanded" ? "half" : "collapsed";
  }
  return startState || "collapsed";
}

// Applies bounded drag translation to the bottom sheet.
function applySheetDrag(deltaY) {
  const resistance = deltaY > 0 ? 1 : 0.85;
  const limitedDelta = clampDragDelta(dragStartState, deltaY / resistance);
  elements.bottomSheet.style.transform = `translateY(${limitedDelta}px)`;
}

// Limits drag movement based on the sheet starting state.
function clampDragDelta(startState, deltaY) {
  if (startState === "collapsed") {
    return Math.max(-260, Math.min(24, deltaY));
  }
  if (startState === "half") {
    return Math.max(-260, Math.min(220, deltaY));
  }
  return Math.max(-24, Math.min(320, deltaY));
}

// Clears temporary bottom-sheet drag styles.
function clearSheetDrag() {
  dragStartY = null;
  dragStartState = null;
  dragPointerId = null;
  elements.bottomSheet.classList.remove("dragging");
  elements.bottomSheet.style.removeProperty("transform");
}
