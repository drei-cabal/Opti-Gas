# Third-Party Libraries

This project should use libraries efficiently: declare package dependencies or link to pinned online browser libraries instead of copying large third-party code into the repository.

## Python Runtime Libraries

Python runtime libraries are declared in:

```text
libraries/python.txt
```

When a teammate runs:

```powershell
pip install -r libraries/python.txt
```

Python installs those packages into the active virtual environment or Python installation, usually under a `site-packages` directory. They are not stored in the repo.

Current runtime libraries:

| Library | Declaration | Purpose |
|---|---|---|
| `cachetools` | `libraries/python.txt` | Provides the in-memory TTL route cache. |
| `Flask` | `libraries/python.txt` | Web app framework. |
| `Flask-Limiter` | `libraries/python.txt` | Runtime API rate limiting. |
| `flask-talisman` | `libraries/python.txt` | Runtime browser security headers and CSP. |
| `haversine` | `libraries/python.txt` | Computes straight-line distance for radius filtering and fallback routing. |
| `openrouteservice` | `libraries/python.txt` | Python client for ORS route distance and duration calls. |
| `pydantic` | `libraries/python.txt` | Validates station records, fuel records, and API request payloads. |
| `python-dotenv` | `libraries/python.txt` | Loads local `.env` values. |
| `requests` | `libraries/python.txt` | Calls the OSRM routing API fallback. |

## Python Development And Security Tools

Development tools are declared in:

```text
libraries/python-dev.txt
```

Install them with:

```powershell
pip install -r libraries/python-dev.txt
```

Current development/security tools:

| Library | Declaration | Purpose |
|---|---|---|
| `pip-audit` | `libraries/python-dev.txt` | Scans Python dependencies for known CVEs. |
| `pytest` | `libraries/python-dev.txt` | Automated test runner. |
| `pytest-cov` | `libraries/python-dev.txt` | Adds coverage reporting to pytest runs. |
| `ruff` | `libraries/python-dev.txt` | Python linting for imports, syntax issues, modernization, and common bug patterns. |

These tools do not run with the Flask app. They are development, QA, and security tools.

Useful commands:

```powershell
python -m ruff check .
python -m pytest --cov=app --cov=utils --cov=scripts --cov-report=term-missing
python -m pip_audit -r libraries/python.txt
```

## Browser Runtime Libraries

Browser libraries should be referenced by pinned online URLs when possible. Do not copy a pile of minified third-party code into the repository unless there is a strong offline requirement.

Browser library metadata lives in:

```text
libraries/browser.json
```

Current browser libraries:

| Library | Online Location | Purpose |
|---|---|---|
| `DOMPurify` | `libraries/browser.json` | Sanitizes dynamic HTML before the browser renders it. |
| `Fuse.js` | `static/js/features/stations.js` direct ESM import from `https://unpkg.com/fuse.js@7.3.0/dist/fuse.mjs` | Provides fuzzy station search by station name, brand, and fuel type. |

The DOMPurify script tag uses Subresource Integrity:

```text
sha384-eCz05P6PHhVK1N9YlA/YY0JLOp3wc37jUGRWexbZ3VZj66h7exte7mtRSD6QoOgZ
```

Fuse.js is loaded as an ES module because it is imported by another ES module instead of being injected as a standalone global script.

## JavaScript And CSS Development Tools

Node-based development tools are declared in:

```text
package.json
package-lock.json
```

Install them with:

```powershell
npm install
```

Current JavaScript/CSS tooling:

| Library | Declaration | Purpose |
|---|---|---|
| `stylelint` | `package.json` | CSS linting for invalid syntax and maintainability checks. |
| `stylelint-config-standard` | `package.json` | Baseline Stylelint rule set. |

Useful command:

```powershell
npm run lint:css
```

## Rules For Adding New Libraries

1. Add Python runtime libraries to `libraries/python.txt`.
2. Add Python-only QA/security tools to `libraries/python-dev.txt`.
3. Add Node-based development tools to `package.json` and commit the matching `package-lock.json`.
4. Add browser libraries to `libraries/browser.json` as pinned online URLs with Subresource Integrity when practical.
5. Use direct ES module imports for browser libraries only when the importing module needs that package shape.
6. Do not copy large third-party library files into the repo unless offline operation is required.
7. Update this document whenever a library is added, removed, or moved.
8. Run `python -m pytest` after Python dependency changes.
9. Run `python -m pip_audit -r libraries/python.txt` after Python dependency changes.
10. Run `npm run lint:css` after CSS tooling or CSS changes.
