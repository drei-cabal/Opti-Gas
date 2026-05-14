# Contribution Task Plan

This plan is for a demo-grade team project. Each contributor should make real code changes, update the related documentation, and have a visible GitHub commit history.

## Contribution Rules

1. Each member must work on a separate branch.
2. Each member must touch code, not only documentation.
3. Each member must update documentation related to their change.
4. Each member must run the relevant checks before asking for review.
5. Avoid unrelated formatting changes so each contribution stays easy to review.

Recommended branch names:

```text
member-name/frontend-price-modal
member-name/backend-update-price-hardening
member-name/css-folder-organization
member-name/qa-browser-coverage
lead/integration-docs
```

## Current Project Checks

Run these before final integration:

```powershell
python scripts\validate_stations.py
python -m pytest
```

Expected current baseline:

- station validation passes
- all backend tests pass
- repo stays clean after tests except ignored cache files

## Member 1: Frontend Price Update Flow

### Goal

Fix the price update modal so it updates the exact station selected by the user.

### Why This Matters

The current frontend opens the price modal from the clicked station card, but submit logic can still resolve the active station instead of the modal target. That can update the wrong station in search or expanded-card flows.

### Assigned Folder Organization

Primary folders:

```text
static/js/features/
static/js/shared/
docs/
```

Primary files:

```text
static/js/features/stations.js
static/js/features/sheets.js
static/js/shared/state.js
docs/RUNNING_APP.md
```

### Required Code Changes

1. Store the selected price-update station when the price modal opens.
2. Make `submitPriceUpdate()` use the stored modal target, not the active station fallback.
3. Clear the stored modal target after success or modal close.
4. Add a temporary loading or disabled state while the update request is running.
5. Keep failed updates visible to the user without closing the modal.

### Documentation Changes

Update `docs/RUNNING_APP.md` with a short manual check for updating a station price from:

- the best-station card
- a non-active station card
- search results

### Acceptance Criteria

- Updating a price from any station card updates that exact station.
- Failed API responses show an error and keep the modal open.
- No unrelated UI redesign is included.
- `python -m pytest` still passes.

### Additional Task: Station Card Interaction Cleanup

Improve the station card interaction so map and list selection feel consistent.

#### Why This Matters

`static/js/features/stations.js` currently has a `scrollToStationCard()` function that does nothing. This makes station selection feel incomplete because choosing a station from the map does not reliably bring the matching card into view.

#### Required Code Changes

1. Implement or remove the empty `scrollToStationCard()` function.
2. When a station is selected from the map, expand the matching station card.
3. Scroll the matching station card into view without breaking the current card animation.
4. Keep station selection working in normal recommendation results and search results.
5. Keep the map focus behavior working when a station card is selected from the list.

#### Documentation Changes

Update `docs/RUNNING_APP.md` with a short manual check for:

- selecting a station from the map
- selecting a station from the list
- selecting a station while search results are active

#### Acceptance Criteria

- Clicking a map marker opens or focuses the matching station card.
- Clicking a station card still focuses the map on that station.
- Search result cards still expand correctly.
- No layout shift or broken animation is introduced.
- The manual browser check is documented.

## Member 2: Backend Price Update Hardening

### Goal

Add demo-safe protection and stricter validation to `POST /api/update-price`.

### Why This Matters

The endpoint mutates `data/stations/stations.json`. For a demo project, full accounts are unnecessary, but the write path still needs basic protection and stronger validation.

### Assigned Folder Organization

Primary folders:

```text
utils/
tests/
docs/
```

Primary files:

```text
app.py
utils/station_store.py
tests/test_app.py
.env.example
docs/FIRST_TIME_SETUP.md
```

### Required Code Changes

1. Add optional `PRICE_UPDATE_TOKEN` support.
2. If `PRICE_UPDATE_TOKEN` is configured, require `X-Price-Update-Token`.
3. Keep local-demo behavior working when no token is configured.
4. Reject unrealistic prices with clear validation errors.
5. Add backend tests for protected and unprotected modes.

### Documentation Changes

Update `.env.example` and `docs/FIRST_TIME_SETUP.md` to explain:

- how to set `PRICE_UPDATE_TOKEN`
- when it is required
- why this is demo hardening, not full production authentication

### Acceptance Criteria

- Existing update-price behavior still works in local demo mode.
- Token-protected mode rejects missing or wrong tokens.
- Token-protected mode accepts the correct token.
- Invalid prices return `400`.
- `python -m pytest tests\test_app.py` passes.

## Member 3: CSS Organization And UI Readability

### Goal

Split the current single CSS file into readable feature-based CSS files without changing the visual design.

### Why This Matters

The original single `static/css/style.css` file has been replaced by modular CSS files. Future UI changes should stay in the matching feature, layout, component, or base stylesheet instead of recreating a large catch-all file.

### Assigned Folder Organization

Primary folders:

```text
static/css/
static/css/base/
static/css/components/
static/css/features/
static/css/layout/
docs/
```

Proposed CSS structure:

```text
static/css/main.css
static/css/base/tokens.css
static/css/base/reset.css
static/css/layout/app-shell.css
static/css/features/map.css
static/css/features/stations.css
static/css/features/garage.css
static/css/features/filters.css
static/css/features/sheets.css
static/css/components/buttons.css
static/css/components/forms.css
static/css/components/modals.css
```

Primary files:

```text
templates/index.html
static/css/main.css
docs/CONTRIBUTION_TASKS.md
docs/RUNNING_APP.md
```

### Required Code Changes

1. Create the new CSS folder structure.
2. Keep related CSS blocks in feature and component files.
3. Replace the template stylesheet reference with `static/css/main.css`.
4. Import the split CSS files from `main.css`.
5. Keep class names and visual behavior unchanged.
6. Do not recreate `style.css`; use `main.css` as the stylesheet entrypoint.

### Documentation Changes

Update `docs/RUNNING_APP.md` with a short note explaining that UI styles now enter through `static/css/main.css`.

### Acceptance Criteria

- The app looks the same after the CSS split.
- `templates/index.html` loads `main.css`.
- CSS is organized by purpose instead of one large file.
- No unrelated UI redesign is included.
- Manual browser smoke test passes on mobile and desktop widths.

## You: Lead Integration, Architecture, And Review

### Goal

Own the final integration and make sure every contribution fits the current architecture.

### Why This Matters

You need a visible contribution too, but your best contribution is not random feature work. It is keeping the team changes coherent, reviewable, and documented.

### Assigned Folder Organization

Primary folders:

```text
docs/
tests/
static/
utils/
```

Primary files:

```text
docs/CONTRIBUTION_TASKS.md
docs/QA_CHECKLIST.md
README.md
CONTEXT.md
```

### Required Code Or Repo Changes

1. Create or maintain this contribution task plan.
2. Create `docs/QA_CHECKLIST.md` for final manual testing.
3. Review member pull requests for scope, test coverage, and folder organization.
4. Resolve integration conflicts.
5. Keep `CONTEXT.md` updated if architecture boundaries change.

### Final Verification

Run:

```powershell
python scripts\validate_stations.py
python -m pytest
```

Then manually verify:

- first open
- Maybe Later
- Garage vehicle create/edit/delete
- active vehicle switching
- recommendation modes
- search
- price update
- directions handoff
- fallback behavior when live routing is unavailable

### Acceptance Criteria

- All members have visible commits touching code.
- All member tasks include documentation updates.
- Final app still passes station validation and tests.
- Final README or docs point to the new task and QA documents.

## Review Checklist

Use this checklist before merging each member contribution:

- Does the branch touch code?
- Is the change scoped to the assigned folder area?
- Are related docs updated?
- Are tests or manual QA notes included?
- Does `python -m pytest` pass?
- Does `python scripts\validate_stations.py` pass if station data changed?
- Does the UI still work on a mobile-width viewport?
- Are there unrelated formatting changes?

## Extra Tasks If Someone Finishes Early

These are optional. Do not start them until the assigned task is complete.

1. Escape or sanitize Leaflet marker label HTML in `static/js/map.js`.
2. Add tests for routing fallback behavior in `utils/routing.py`.
3. Add a `Known Demo Limitations` section to `README.md`.
4. Add a short browser smoke-test script or checklist for release demos.
