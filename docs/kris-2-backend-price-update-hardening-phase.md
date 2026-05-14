# Kris 2 Backend Price Update Hardening Phase

## Goal

Harden `POST /api/update-price` so the demo can safely allow station price edits while keeping local setup easy.

This phase belongs on:

```text
kris/backend-update-price-hardening
```

## Current Scope

Kris owns the backend write path for station prices:

- `app.py`
- `utils/station_store.py`
- `tests/test_app.py`
- `tests/test_station_store.py`
- `.env.example`
- relevant setup or running docs if configuration changes

Avoid frontend price-modal changes in this branch unless needed to support backend behavior. Adrian's branch owns the modal targeting flow.

## Commit 1: Document The Backend Contract

Purpose:

Record the exact protected and unprotected behavior before changing code.

Suggested changes:

- Add a short section to `README.md` or `docs/RUNNING_APP.md` explaining `PRICE_UPDATE_TOKEN`.
- Document that local demo mode remains open when no token is configured.
- Document that protected mode requires the `X-Price-Update-Token` header.

Suggested commit:

```text
docs: describe price update protection
```

## Commit 2: Add Configuration Plumbing

Purpose:

Load the optional token from the environment without changing behavior yet.

Suggested changes:

- Add `PRICE_UPDATE_TOKEN=` to `.env.example`.
- Add `PRICE_UPDATE_TOKEN=os.getenv("PRICE_UPDATE_TOKEN", "").strip()` to `create_app()`.
- Keep the default empty string so current local behavior stays unchanged.

Acceptance checks:

- App still starts without `PRICE_UPDATE_TOKEN`.
- Existing update-price tests still pass after dependencies are installed.

Suggested commit:

```text
config: add optional price update token setting
```

## Commit 3: Add Token Guard To The Endpoint

Purpose:

Protect `POST /api/update-price` only when a token is configured.

Suggested changes:

- In `api_update_price()`, read `app.config["PRICE_UPDATE_TOKEN"]`.
- If configured, require `request.headers.get("X-Price-Update-Token")` to match.
- Return `401` with a clear JSON error when the token is missing or wrong.
- If no token is configured, allow the request exactly as before.

Suggested helper shape:

```python
def _is_price_update_authorized(configured_token: str, provided_token: str | None) -> bool:
    return not configured_token or provided_token == configured_token
```

Suggested commit:

```text
api: require price update token when configured
```

## Commit 4: Define Demo-Safe Price Bounds

Purpose:

Reject obviously unrealistic prices before mutating `stations.json`.

Suggested changes:

- Add named constants for demo bounds, preferably near the endpoint or in `station_store.py`.
- Recommended first pass:

```python
MIN_DEMO_FUEL_PRICE = 20.0
MAX_DEMO_FUEL_PRICE = 200.0
```

Why this range:

- Current dataset prices are around PHP 86-100 per liter.
- The range catches accidental `0`, `1`, `999`, or misplaced decimal values.
- It is loose enough to avoid overfitting the demo to one exact price week.

Suggested commit:

```text
validation: define demo fuel price bounds
```

## Commit 5: Enforce Price Bounds In The API

Purpose:

Return clear validation errors for unrealistic prices.

Suggested changes:

- Keep the existing numeric and positive checks.
- Add bounds validation after converting `new_price` to `float`.
- Return `400` JSON errors such as:

```json
{"error": "new_price must be between 20.00 and 200.00."}
```

Acceptance checks:

- Existing valid update flow still works.
- Low values like `1` fail.
- High values like `999` fail.
- Non-numeric values still fail with the existing numeric message.

Suggested commit:

```text
api: reject unrealistic fuel prices
```

## Commit 6: Add Protected Mode Tests

Purpose:

Prove token protection works without relying on manual testing.

Suggested tests in `tests/test_app.py`:

- configured token + missing header returns `401`
- configured token + wrong header returns `401`
- configured token + correct header updates price successfully

Use `create_app({"TESTING": True, "PRICE_UPDATE_TOKEN": "test-token", ...})`.

Suggested commit:

```text
test: cover protected price updates
```

## Commit 7: Add Unprotected Mode And Validation Tests

Purpose:

Prove local demo behavior still works and price validation is stricter.

Suggested tests:

- no configured token still allows valid update
- price below minimum returns `400`
- price above maximum returns `400`
- failed validation does not mutate `stations.json`

Suggested commit:

```text
test: cover unprotected price updates and bounds
```

## Commit 8: Final Integration Cleanup

Purpose:

Make the branch easy to review and merge.

Suggested changes:

- Remove duplicated validation logic if it appears during implementation.
- Keep error messages consistent.
- Re-read `README.md`, `.env.example`, and tests for naming consistency.
- Make sure no frontend files changed unless intentionally needed.

Run before final push:

```powershell
python scripts\validate_stations.py
python -m pytest
git status --short
```

Expected result:

- station validation passes
- backend tests pass
- no unexpected generated files are tracked

Suggested commit:

```text
chore: polish price update hardening phase
```

## Suggested Implementation Order

1. Start from updated `master`.
2. Create `kris/backend-update-price-hardening`.
3. Make the documentation/config commits first.
4. Add the token guard before price bounds.
5. Add tests immediately after each behavior change.
6. Keep each commit focused on one behavior.

## Definition Of Done

Kris 2 is complete when:

- `PRICE_UPDATE_TOKEN` is optional.
- Empty token keeps local demo updates working.
- Configured token requires `X-Price-Update-Token`.
- Missing or invalid token returns `401`.
- Unrealistic prices return `400`.
- Backend tests cover protected and unprotected modes.
- Station validation still passes.
- The branch contains several small, reviewable commits.
