# Security Measures

This guide defines the security measures that should be taken for the Opti-Gas system. The app is a Flask + Leaflet web app with local JSON station data, browser-side Garage state, and external routing through OpenRouteService or OSRM.

For the latest local breach and attack simulation report, see `docs/SECURITY_ATTACK_SIMULATION_REPORT.md`.

## Grill-Me Decision

Question: Is this system being secured as a simple local/team demo, or should it follow a production-like security posture?

Recommended answer: use a production-like security posture even though this is a demo. The project will not add login and currently has no database, so security must come from strict defaults, protected mutation paths, input validation, file integrity controls, secret hygiene, and clear operational rules.

## Project Security Constraints

The security plan must respect these constraints:

1. No login system will be added.
2. No database is currently used.
3. Station data is stored in `data/stations/stations.json`.
4. The public browser app must not receive secrets.
5. Any write operation must be treated as privileged.

Important consequence: without login, there is no secure way to identify individual public users. Any token embedded in frontend JavaScript, stored in `localStorage`, or typed into a normal public browser flow should be treated as exposed. Production-like security therefore requires write actions to be admin/operator-only, not regular public user actions.

## Highest Priority Measures

### 1. Protect Station Price Updates

Status: partially implemented.

Current behavior:

- `POST /api/update-price` can mutate `data/stations/stations.json`.
- `PRICE_UPDATE_TOKEN` can protect the endpoint when configured.
- `X-Price-Update-Token` is required only when `PRICE_UPDATE_TOKEN` is set.
- the current browser update flow does not send the token.

Required measures:

1. Require `PRICE_UPDATE_TOKEN` in every non-local environment.
2. Do not leave `PRICE_UPDATE_TOKEN` empty when the app is exposed on a network.
3. Do not embed `PRICE_UPDATE_TOKEN` in frontend JavaScript.
4. Do not store `PRICE_UPDATE_TOKEN` in `localStorage`, `sessionStorage`, or visible page markup.
5. Keep token values out of Git.
6. Rotate the token if it is shared publicly or accidentally committed.
7. Keep tests for protected and unprotected update modes.

Production-like rule without login:

- public users should not be able to update prices directly.
- price updates should be performed by a trusted operator through a private tool, local script, or controlled request that can attach `X-Price-Update-Token` outside the public browser bundle.
- if the public UI keeps an `Update Price` button, it should either submit a non-mutating report for review or be disabled when token protection is enabled.

If the project scope changes later, replace the shared token with real authentication, role-based authorization, and audit logging.

### 2. Disable Debug Exposure

Status: safer defaults are required.

Current behavior:

- direct launch reads `FLASK_DEBUG` from the environment
- `.env.example` should use production-like local defaults

Required measures:

1. Use `FLASK_DEBUG=0` by default.
2. Avoid `FLASK_HOST=0.0.0.0` unless there is an intentional LAN test.
3. Use `127.0.0.1` for local-only runs.
4. Never expose Flask debug mode to public networks.

Recommended local defaults:

```env
FLASK_DEBUG=0
FLASK_HOST=127.0.0.1
FLASK_PORT=5000
```

### 3. Protect API Keys And Secrets

Status: required operational control.

Current secret:

- `ORS_API_KEY`

Required measures:

1. Keep `.env` ignored by Git.
2. Do not paste `ORS_API_KEY` into screenshots, issues, commits, or docs.
3. Use `.env.example` only for blank placeholders.
4. Rotate `ORS_API_KEY` if it is exposed.
5. For team testing, each member should use their own key or receive it through a private channel.
6. Never send `ORS_API_KEY` or `PRICE_UPDATE_TOKEN` to the browser.
7. Never log request headers that could contain tokens.

### 4. Sanitize Map Marker HTML

Status: still recommended.

Current risk:

- Leaflet markers use `L.divIcon({ html: ... })`.
- Station labels come from station names.

Required measures:

1. Escape station label text before inserting it into marker HTML.
2. Keep `markerState` restricted to known internal values.
3. Do not insert raw station data into `html` strings without escaping.

Why this matters:

- station data is currently local, but any future import or teammate edit could introduce unsafe text.

### 5. Validate All User-Controlled Inputs

Status: partially implemented.

Current protected areas:

- recommendation query parsing validates numeric values
- price update validates price type and demo price bounds

Required measures:

1. Keep validation centralized in backend seams.
2. Validate numeric bounds for coordinates, radius, price, fuel consumption, and liters.
3. Return clear JSON errors for invalid API input.
4. Add tests for every new validation rule.

### 6. Rate Limit Recommendation Requests

Status: implemented with `Flask-Limiter`.

Current behavior:

- `GET /api/recommend` is limited per client IP.
- default limit is 60 requests per 60 seconds.
- blocked requests return `429` with a `Retry-After` header.

Required measures:

1. Keep `RECOMMEND_RATE_LIMIT_COUNT` set in shared environments.
2. Keep `RECOMMEND_RATE_LIMIT_WINDOW_SEC` set to a clear window size.
3. Use `RECOMMEND_RATE_LIMIT_COUNT=0` only for controlled local testing.
4. Add reverse-proxy rate limiting if the app is deployed with multiple workers or exposed publicly.
5. Do not log exact user coordinates while troubleshooting rate limits.

Configuration:

```env
RECOMMEND_RATE_LIMIT_COUNT=60
RECOMMEND_RATE_LIMIT_WINDOW_SEC=60
RATELIMIT_STORAGE_URI=memory://
```

Limitation:

- `memory://` protects this Flask process only. A production deployment with multiple workers should use a shared limiter store such as Redis and enforce the same or stricter limit at the reverse proxy or gateway layer.

### 7. Protect JSON File Integrity

Status: required because there is no database.

Current risk:

- station data is mutable file-backed JSON.
- a bad write can corrupt the source of truth.

Required measures:

1. Validate station data before and after write operations.
2. Write updates atomically by writing to a temporary file and replacing the original only after validation.
3. Keep a backup copy before bulk edits or demos.
4. Use file locking or a single-writer policy if multiple update requests can happen at the same time.
5. Run `python scripts\validate_stations.py` after any station-data change.
6. Keep `data/stations/stations.json` reviewed in pull requests.

## Medium Priority Measures

### 8. Limit Browser Storage Risk

Current behavior:

- Garage vehicles and last session state are stored in browser `localStorage`.
- setup prompt state uses `sessionStorage`.

Required measures:

1. Do not store secrets, API keys, or tokens in `localStorage`.
2. Treat Garage data as local convenience data, not protected user data.
3. Add a clear-reset option if privacy becomes a user-facing requirement.
4. Document that browser storage persists on the device.

### 9. Control Route Cache Retention

Current behavior:

- route results are cached in memory with a short TTL.

Required measures:

1. Keep route cache in memory.
2. Avoid persisting exact user coordinates unless there is a clear product need.
3. If persistent caching is added later, document retention and provide cleanup.

### 10. Keep Dependencies Updated

Current dependencies:

```text
Flask
Flask-Limiter
flask-talisman
python-dotenv
requests
```

Required measures:

1. Periodically run dependency freshness checks.
2. Separate "newer version exists" from "confirmed vulnerability."
3. Update pinned versions only after tests pass.
4. Keep runtime libraries in `libraries/python.txt`.
5. Keep development and audit tools in `libraries/python-dev.txt`.

Suggested command:

```powershell
python -m pip install -r libraries/python-dev.txt
python -m pip list --outdated --format=json
python -m pip_audit
```

### 11. Add Security-Oriented QA Checks

Required manual checks:

1. Try price update without token when token is configured.
2. Try price update with wrong token.
3. Try invalid prices such as `0`, negative values, text, and very high values.
4. Try malformed recommendation query values.
5. Confirm `.env` is not tracked by Git.
6. Confirm debug mode is off before any shared demo.
7. Confirm the public browser bundle does not contain `PRICE_UPDATE_TOKEN` or `ORS_API_KEY`.
8. Confirm station JSON remains valid after any allowed update.
9. Confirm repeated `/api/recommend` requests eventually return `429`.

Suggested automated checks:

- token-required price update test
- invalid-token price update test
- price bounds tests
- marker escaping unit test if marker rendering is refactored into a testable helper

## Lower Priority Measures

### 12. Add Basic Security Headers

Status: implemented with `Flask-Talisman`.

Current headers and policies include:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy`
- HTTPS forcing can be enabled with `SECURITY_FORCE_HTTPS=1`

The Content Security Policy allows the current app dependencies:

- app scripts and styles from `self`
- Leaflet from `unpkg.com`
- Google Fonts
- Carto map tiles

Keep `SECURITY_FORCE_HTTPS=0` for plain local `http://127.0.0.1:5000` testing. Set it to `1` only when the app is actually served through HTTPS.

### 13. Sanitize Browser HTML With DOMPurify

Status: implemented for Leaflet marker HTML.

Current behavior:

- `DOMPurify` is loaded from the pinned URL declared in `libraries/browser.json`.
- marker HTML in `static/js/map.js` is sanitized before passing it to `L.divIcon`.
- a small HTML-escape fallback remains if the library fails to load.

Required measures:

1. Use DOMPurify for future dynamic HTML insertion.
2. Do not bypass DOMPurify for station names, fuel names, or any imported station data.
3. Keep the pinned DOMPurify version and SRI hash updated during dependency/security reviews.

### 14. Rate Limit Write Endpoints

Recommended if the app is exposed beyond localhost:

- rate limit `POST /api/update-price`
- log repeated failed token attempts
- keep logs free of secrets and exact user coordinates

### 13. Add Backup And Recovery For Station Data

Recommended because `stations.json` is mutable:

1. Back up `data/stations/stations.json` before demos.
2. Keep station validation as the gate after edits.
3. Add a simple restore process if a bad update is saved.

## Security Task Assignments

### Backend Member

- enforce and document `PRICE_UPDATE_TOKEN`
- ensure token-protected mode is the required mode outside localhost
- maintain `/api/recommend` rate limiting and tests
- keep price validation tests passing
- add any missing API validation tests
- add or verify atomic station JSON writes

### Frontend Member

- avoid storing secrets in browser storage
- sanitize or refactor marker label rendering
- keep price update errors visible and clear
- do not add token handling to public browser JavaScript

### QA Member

- create security QA cases for token, invalid input, debug mode, and `.env`
- verify browser behavior after failed update attempts
- verify that public UI cannot mutate station data when token protection is enabled

### Lead

- verify `.env` is ignored
- confirm debug settings before demos
- confirm `.env.example` uses safe defaults
- review security docs before final submission
- run final `python -m pytest`

## Current Security Position

The system is acceptable for a production-like demo without login or a database if:

1. `PRICE_UPDATE_TOKEN` is configured outside localhost.
2. The token is never shipped to frontend JavaScript.
3. Public users cannot directly perform station-data mutations.
4. Flask debug mode is off by default.
5. `.env` remains untracked.
6. marker label escaping is addressed before importing untrusted station data.
7. `/api/recommend` is rate limited to protect ORS quota.
8. station JSON writes are validated and recoverable.
9. tests and manual QA pass before final presentation.

It is still not fully production-ready without real authentication, authorization, durable persistence, rate limiting, deployment hardening, and formal secret management. Those are intentionally outside the current project constraints.
