---
name: opti-gas-ui-design-engineering
description: Use when refining the Opti-Gas mobile UI, visual hierarchy, theme tokens, map overlays, Garage flows, sheets, or modal ergonomics. Applies to design-engineering work that must preserve the app's map-first structure, dark chrome, muted blue-gray surfaces, white top-elevation modals, and amber recommendation emphasis while keeping docs in sync.
---

# Opti-Gas UI Design Engineering

Use this skill for UI polish, theme changes, layout tightening, interaction cleanup, and mobile-first design engineering inside this repo.

## Defaults

- Preserve the app's map-first structure.
- Keep search, advisory, prompts, and bottom navigation in dark chrome.
- Use muted cool blue-gray surfaces for cards, sheets, filters, and Garage.
- Reserve white for highest-elevation surfaces such as modals.
- Reserve amber for recommendation emphasis, active badges, and best-station cues.

## Workflow

1. Inspect the live HTML, CSS, and JS involved before changing visuals.
2. Prefer token-level or shared-style changes before one-off overrides.
3. Keep mobile spacing tight and practical; avoid decorative padding growth.
4. For interactions, preserve the user's mental model first, then fix the bug with the smallest behavioral delta.
5. If Map and Garage behavior changes, update:
   - `docs/map-garage-product-spec.md`
   - `docs/opti-route-formula-spec.md` when trip inputs or recommendation inputs change
   - `README.md` when developer-facing behavior or UI architecture changes

## Guardrails

- Do not introduce new primary destinations beyond `Map` and `Garage` without explicit product direction.
- Do not add dark mode by default unless explicitly requested.
- Do not move tank status into saved vehicle data; it belongs to the Map filter flow.
- Do not reintroduce landmark selection unless product scope changes.
- Keep the station sheet collapsed state compact and recommendation-first.

## Preferred Approach

- Theme work: update root tokens first, then patch exceptions.
- Mobile polish: tighten typography, spacing, and action hierarchy before changing layout structure.
- Map polish: make markers and sheet accents align with the current theme without reducing recommendation clarity.
- Modal polish: improve field rhythm and action hierarchy; keep primary, secondary, and destructive actions visually distinct.

## Verification

- Run `node --check static/js/ui.js` after JS changes.
- Manually verify the affected flow in the browser when possible.
- Confirm that any doc statements you touched match the actual UI behavior.
