import { elements, state } from "../shared/state.js";
import { escapeHtml, formatAdvisoryDate } from "../shared/formatters.js";

let advisoryDragStartY = null;
let advisoryDragPointerId = null;
let advisoryCloseTimeoutId = null;
let advisoryOpenFrameId = null;

// Displays a transient app announcement and syncs advisory state.
export function showAnnouncement(message, tone = "info", options = {}) {
  state.activeAnnouncement = {
    kind: options.kind || (tone === "warning" ? "location" : "system"),
    tone,
    title:
      options.title ||
      (tone === "warning" ? "Location access off" : "Notice"),
    message,
    date: new Date().toISOString().slice(0, 10),
  };
  syncAdvisories();
}

// Clears the active announcement banner state.
export function clearAnnouncement() {
  state.activeAnnouncement = null;
  syncAdvisories();
}

// Shows a location-specific warning when GPS cannot be used.
export function applyLocationFailureMessage({ banner }) {
  showAnnouncement(banner, "warning", {
    title: "Location access off",
    kind: "location",
  });
}

// Opens or closes the advisory sheet from the announcement button.
export function toggleAnnouncement() {
  if (state.isAnnouncementOpen) {
    closeAdvisorySheet();
    return;
  }
  renderAdvisories();
  openAdvisorySheet();
  state.isAnnouncementOpen = true;
  elements.announcementButton.setAttribute("aria-expanded", "true");
}

// Rebuilds advisory items and renders the advisory indicator.
export function syncAdvisories() {
  state.advisoryItems = buildAdvisoryItems();
  elements.announcementButton.classList.toggle(
    "announcement-button--empty",
    !state.activeAnnouncement
  );
  elements.announcementButton.setAttribute(
    "aria-expanded",
    state.isAnnouncementOpen ? "true" : "false"
  );
  if (state.isAnnouncementOpen) {
    renderAdvisories();
  }
}

// Attaches drag gestures to advisory sheet handles.
export function bindAdvisoryDrag(element) {
  if (!element) {
    return;
  }

  element.addEventListener("pointerdown", (event) => {
    advisoryDragPointerId = event.pointerId;
    advisoryDragStartY = event.clientY;
    elements.advisorySheet.classList.add("advisory-sheet--dragging");
    if (typeof element.setPointerCapture === "function") {
      element.setPointerCapture(event.pointerId);
    }
  });

  element.addEventListener("pointermove", (event) => {
    if (advisoryDragStartY == null || advisoryDragPointerId !== event.pointerId) {
      return;
    }
    const deltaY = Math.max(0, event.clientY - advisoryDragStartY);
    setAdvisoryTranslate(`${deltaY}px`);
  });

  element.addEventListener("pointerup", (event) => {
    if (advisoryDragStartY == null || advisoryDragPointerId !== event.pointerId) {
      return;
    }
    const deltaY = event.clientY - advisoryDragStartY;
    if (deltaY > 80) {
      closeAdvisorySheetWithMotion({ fromDrag: true });
      return;
    }
    clearAdvisoryDrag();
  });

  element.addEventListener("pointercancel", () => {
    clearAdvisoryDrag();
  });
}

// Closes the advisory sheet using the normal close motion.
export function closeAdvisorySheet() {
  closeAdvisorySheetWithMotion({ fromDrag: false });
}

// Builds the current advisory list from announcement and station freshness state.
function buildAdvisoryItems() {
  const items = [];
  if (state.activeAnnouncement) {
    items.push({
      badge: state.activeAnnouncement.tone === "warning" ? "Alert" : "Info",
      tone: state.activeAnnouncement.tone,
      date: state.activeAnnouncement.date,
      title: state.activeAnnouncement.title,
      body: state.activeAnnouncement.message,
    });
  }

  items.push({
    badge: "Info",
    tone: "info",
    date: new Date().toISOString().slice(0, 10),
    title: "Estimate advisory",
    body:
      "Prices, travel times, and trip costs are estimates. They can change after live routing, traffic, or station updates.",
  });

  items.push({
    badge: "Guide",
    tone: "guide",
    date: "2026-05-01",
    title: "Quick advisory guide",
    body:
      "Use Garage to save a vehicle, then return to Map for personalized recommendations.",
  });

  return items;
}

// Renders advisory rows and the announcement button indicator.
function renderAdvisories() {
  elements.advisoryList.innerHTML = state.advisoryItems
    .map(
      (item) => `
        <article class="advisory-card">
          <div class="advisory-card__meta">
            <span class="advisory-card__badge advisory-card__badge--${item.tone}">${escapeHtml(
              item.badge
            )}</span>
            <span>${formatAdvisoryDate(item.date)}</span>
          </div>
          <h3 class="advisory-card__title">${escapeHtml(item.title)}</h3>
          <p class="advisory-card__body">${escapeHtml(item.body)}</p>
        </article>
      `
    )
    .join("");
}

// Animates the advisory sheet closed after a tap or drag.
function closeAdvisorySheetWithMotion({ fromDrag }) {
  if (elements.advisorySheet.classList.contains("hidden")) {
    state.isAnnouncementOpen = false;
    elements.announcementButton.setAttribute("aria-expanded", "false");
    resetAdvisoryDragState();
    return;
  }

  if (advisoryCloseTimeoutId) {
    window.clearTimeout(advisoryCloseTimeoutId);
  }
  if (advisoryOpenFrameId) {
    window.cancelAnimationFrame(advisoryOpenFrameId);
    advisoryOpenFrameId = null;
  }

  elements.advisorySheet.classList.remove("advisory-sheet--preopen");
  state.isAnnouncementOpen = false;
  elements.announcementButton.setAttribute("aria-expanded", "false");
  if (!fromDrag) {
    resetAdvisoryDragState();
    setAdvisoryTranslate(0);
  }

  elements.advisorySheet.classList.remove("advisory-sheet--dragging");
  requestAnimationFrame(() => {
    setAdvisoryTranslate("calc(100% + 24px)");
    setAdvisoryScrimOpacity(0);
  });

  advisoryCloseTimeoutId = window.setTimeout(() => {
    elements.advisorySheet.classList.add("hidden");
    elements.advisorySheet.classList.remove("advisory-sheet--dragging");
    setAdvisoryTranslate("calc(100% + 24px)");
    advisoryCloseTimeoutId = null;
  }, 280);
}

// Clears drag styles from the advisory sheet after movement ends.
function clearAdvisoryDrag() {
  resetAdvisoryDragState();
  setAdvisoryTranslate(0);
}

// Expands the advisory sheet and applies its scrim.
function openAdvisorySheet() {
  if (advisoryCloseTimeoutId) {
    window.clearTimeout(advisoryCloseTimeoutId);
    advisoryCloseTimeoutId = null;
  }
  if (advisoryOpenFrameId) {
    window.cancelAnimationFrame(advisoryOpenFrameId);
    advisoryOpenFrameId = null;
  }
  resetAdvisoryDragState();
  elements.advisorySheet.classList.remove("hidden");
  elements.advisorySheet.classList.add("advisory-sheet--preopen");
  setAdvisoryTranslate("calc(100% + 24px)");
  setAdvisoryScrimOpacity(0);
  advisoryOpenFrameId = window.requestAnimationFrame(() => {
    advisoryOpenFrameId = window.requestAnimationFrame(() => {
      elements.advisorySheet.classList.remove("advisory-sheet--preopen");
      setAdvisoryTranslate(0);
      setAdvisoryScrimOpacity(1);
      advisoryOpenFrameId = null;
    });
  });
}

// Resets advisory drag state after drag completion.
function resetAdvisoryDragState() {
  advisoryDragStartY = null;
  advisoryDragPointerId = null;
  elements.advisorySheet.classList.remove("advisory-sheet--dragging");
}

// Applies vertical drag translation to the advisory panel.
function setAdvisoryTranslate(value) {
  const translateValue = typeof value === "number" ? `${value}px` : value;
  elements.advisoryPanel.style.setProperty("--advisory-translate", translateValue);
  if (typeof value === "number") {
    const panelHeight = elements.advisoryPanel.offsetHeight || 1;
    const progress = Math.max(0, Math.min(1, 1 - value / panelHeight));
    setAdvisoryScrimOpacity(progress);
  }
}

// Adjusts advisory scrim opacity during drag interactions.
function setAdvisoryScrimOpacity(value) {
  const opacity = typeof value === "number" ? Math.max(0, Math.min(1, value)) : value;
  elements.advisorySheet.style.setProperty("--advisory-scrim-opacity", String(opacity));
}
