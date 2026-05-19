# Security Attack Simulation Report

Date: 2026-05-14

Scope: local defensive simulation against the Opti-Gas Flask app and repository. The app was not exposed on a public network during this simulation.

## Executive Summary

The simulated attacks showed that the current security controls are working for the tested scenarios:

- repository secret exposure check passed
- price update token enforcement passed
- invalid price tampering was rejected without mutating station data
- malformed recommendation requests were rejected
- recommendation rate limiting blocked repeated requests
- frontend JavaScript did not expose `ORS_API_KEY` or `PRICE_UPDATE_TOKEN`
- marker HTML is now sanitized with DOMPurify before being passed to Leaflet
- dependency vulnerability audit passed with no known vulnerabilities

Remaining warning:

- local `.env` contains a real `ORS_API_KEY`. This is acceptable for local development only. It becomes a breach if `.env` is copied, uploaded, screen-shared, or committed.

## Security Libraries In Use

| Library | Runtime | Purpose |
|---|---:|---|
| `Flask-Limiter` | Yes | Route-level rate limiting for `GET /api/recommend`. |
| `Flask-Talisman` | Yes | Security headers and Content Security Policy. |
| `DOMPurify` | Yes, browser | Sanitizes marker HTML before Leaflet renders it. |
| `pip-audit` | No, QA tool | Scans Python dependencies for known vulnerabilities. |

## Simulation Method

The simulation used Flask's local test client, static repository scans, and dependency audit tooling. It did not attack an external server and did not print secret values.

Checks performed:

1. Git tracked-file scan for `.env` and obvious secret patterns.
2. Local `.env` presence check without printing secret values.
3. Token bypass attempts against `POST /api/update-price`.
4. Invalid price tampering against `POST /api/update-price`.
5. Malformed query attack against `GET /api/recommend`.
6. Repeated recommendation requests to verify rate limiting.
7. Frontend JavaScript scan for secret identifiers.
8. Marker HTML sanitization review.
9. Security header verification.
10. Dependency vulnerability audit with `pip-audit`.

## Results

| Attack Scenario | Result | Evidence |
|---|---:|---|
| Repository secret exposure | Pass | `.env` is not tracked; `.env` is ignored; tracked matches were placeholders or config names only. |
| Local secret exposure | Warning | Local `.env` exists and contains an `ORS_API_KEY`. This must stay local. |
| Unauthorized price mutation without token | Pass | Missing token returns `401`; station JSON does not change. |
| Unauthorized price mutation with wrong token | Pass | Wrong token returns `401`; station JSON does not change. |
| Authorized price mutation with correct token | Pass | Correct token returns `200`; intended station fuel price changes. |
| Invalid high price tampering | Pass | Invalid price returns `400`; station JSON remains unchanged. |
| Malformed recommendation query | Pass | Invalid latitude returns `400`. |
| ORS quota abuse through repeated recommendations | Pass | `Flask-Limiter` returns `429` after the configured request limit. |
| Frontend secret disclosure | Pass | `ORS_API_KEY` and `PRICE_UPDATE_TOKEN` are not present in frontend JavaScript. |
| Marker HTML injection | Pass | Marker HTML is sanitized with DOMPurify, with an HTML-escape fallback. |
| Missing browser security headers | Pass | `Flask-Talisman` sets CSP, `X-Content-Type-Options`, and `Referrer-Policy`. |
| Vulnerable Python dependencies | Pass | `python -m pip_audit -r libraries/python.txt` found no known vulnerabilities. |

## Notable Controls

### Protected Price Mutation

`POST /api/update-price` rejects missing or wrong `X-Price-Update-Token` when `PRICE_UPDATE_TOKEN` is configured. Invalid prices are rejected before the station file is mutated.

### Recommendation Rate Limiting

`GET /api/recommend` is protected by `Flask-Limiter`. The default configuration allows 60 requests per client IP per 60-second window.

```env
RECOMMEND_RATE_LIMIT_COUNT=60
RECOMMEND_RATE_LIMIT_WINDOW_SEC=60
RATELIMIT_STORAGE_URI=memory://
```

`memory://` is acceptable for this single-process app. A multi-worker or public deployment should use a shared limiter store and reverse-proxy rate limiting.

### Browser Security Headers

`Flask-Talisman` applies browser security headers and a Content Security Policy that allows the app's current dependencies:

- app scripts and styles from `self`
- Leaflet from `unpkg.com`
- Google Fonts
- Carto map tiles

HTTPS forcing remains configurable because local development uses plain HTTP:

```env
SECURITY_FORCE_HTTPS=0
```

Set it to `1` only when serving through HTTPS.

### Marker HTML Sanitization

`DOMPurify` is loaded through the pinned online library URL declared in:

```text
libraries/browser.json
```

`static/js/map.js` sanitizes marker HTML before passing it to `L.divIcon`.

## Attack Scenarios Not Fully Simulated

These are applicable but were not fully executed in this local run:

1. Public network scan of a running Flask server.
2. Full browser XSS execution with malicious imported station fixtures.
3. Multi-process rate-limit bypass.
4. Reverse-proxy misconfiguration.
5. External ORS quota exhaustion from many distributed IPs.

These require a deployed environment, browser automation, or infrastructure-level controls.

## Recommended Remediation Order

1. Keep `PRICE_UPDATE_TOKEN` required outside localhost.
2. Keep `/api/recommend` rate limiting enabled.
3. Add reverse-proxy or gateway rate limiting if publicly deployed.
4. Keep `.env` out of Git and out of shared archives.
5. Add a browser QA pass for marker rendering with malicious station-name fixtures.
6. Keep `python -m pip_audit -r libraries/python.txt` in the final security checklist.

## Current Security Position

The app is in a stronger production-like demo posture:

- secrets are server-side
- `.env` is ignored
- write endpoint supports token protection
- recommendation endpoint is library-rate-limited
- station writes are atomic and validated
- browser security headers are library-managed
- marker HTML is sanitized with DOMPurify
- runtime dependencies currently have no known vulnerabilities

Remaining risk is mostly deployment hardening: HTTPS configuration, shared rate-limit storage for multi-worker hosting, reverse-proxy controls, and operational secret management.
