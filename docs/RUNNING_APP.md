# Running OPTI-GAS

This guide explains how to run the project in different scenarios.

## 1. Normal setup: Python already installed

Open a terminal in:

```powershell
C:\Users\ANDREI\Documents\Opti-Gas
```

Create a virtual environment:

```powershell
python -m venv .venv
```

Activate it:

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r libraries/python.txt
```

For security audit tooling such as `pip-audit`, install the development requirements:

```powershell
pip install -r libraries/python-dev.txt
```

If you will edit CSS or run frontend lint checks, install the Node development tools too:

```powershell
npm install
```

Create your environment file if needed:

```powershell
copy .env.example .env
```

The app reads runtime settings from `.env`. `.env.example` is only a template for creating that local file.

### Optional price update protection

The station price update endpoint can be protected for demos with a shared token:

```env
PRICE_UPDATE_TOKEN=change-this-demo-token
```

When `PRICE_UPDATE_TOKEN` is empty or unset, local demo price updates remain open so the app is easy to run on a fresh machine. When `PRICE_UPDATE_TOKEN` is configured, every `POST /api/update-price` request must include the same value in the `X-Price-Update-Token` header. Requests with a missing or incorrect token should be rejected with a JSON authorization error before `data/stations/stations.json` is changed.

### Recommendation rate limiting

The recommendation endpoint is rate limited per client IP to reduce accidental or abusive ORS usage:

```env
RECOMMEND_RATE_LIMIT_COUNT=60
RECOMMEND_RATE_LIMIT_WINDOW_SEC=60
```

The default allows 60 `GET /api/recommend` requests per client IP per 60-second window. Set `RECOMMEND_RATE_LIMIT_COUNT=0` only for controlled local testing where rate limiting must be disabled.

Opti-Gas uses `Flask-Limiter` for runtime rate limiting:

```env
RATELIMIT_STORAGE_URI=memory://
```

`memory://` is fine for this single-process app. If the app is deployed with multiple workers, use a shared limiter store such as Redis and enforce rate limits at the reverse proxy as well.

### Routing mode

Local demo runs default to fast estimated routing:

```env
ROUTING_MODE=estimate
```

Set this in `.env`. This uses the app's Haversine-based road-distance estimate, so filters and first-load recommendations do not wait on ORS or OSRM network calls.

For full live-route testing, configure an ORS key and switch routing mode:

```env
ORS_API_KEY=your_real_api_key_here
ROUTING_MODE=live
```

### Security headers

Opti-Gas uses `Flask-Talisman` to add browser security headers and a Content Security Policy. Local development keeps HTTPS forcing off:

```env
SECURITY_FORCE_HTTPS=0
```

Set `SECURITY_FORCE_HTTPS=1` only when the app is served through HTTPS. Do not enable it for plain local `http://127.0.0.1:5000` testing.

Run the app:

```powershell
python app.py
```

Open:

```text
http://127.0.0.1:5000
```

If the Map opens but recommendations do not appear, make sure the browser allowed current location access and the OpenRouteService API key is configured. For full system testing, both are required.

The Map starts a live browser geolocation watch after load. A cached last location may appear briefly, but the app should recalibrate to the current GPS fix and refresh recommendations after meaningful movement. If you physically move and the map does not update, check device location services, browser site permission, and whether the page is still open in the foreground.

## 2. If `python` does not work but Python is installed

Some Windows setups use `py` instead of `python`.

Create the virtual environment:

```powershell
py -m venv .venv
```

Activate it:

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
py -m pip install -r libraries/python.txt
```

Run the app:

```powershell
py app.py
```

## 3. If Python is not installed at all

Install Python 3.12 or newer from the official Python website:

```text
https://www.python.org/downloads/
```

Important during installation:

- enable `Add python.exe to PATH`
- install `pip`

After installation, close and reopen the terminal, then follow the normal setup.

## 4. If PowerShell blocks virtual environment activation

Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.venv\Scripts\Activate.ps1
```

This only affects the current terminal session.

## 5. Run in VS Code

Open the `Opti-Gas` folder in VS Code.

Open the integrated terminal and run:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r libraries/python.txt
python app.py
```

If VS Code asks you to select a Python interpreter, choose:

```text
.venv\Scripts\python.exe
```

## 6. Validate station data only

If you only want to check `stations.json`:

```powershell
python scripts\validate_stations.py
```

Or:

```powershell
py scripts\validate_stations.py
```

Expected success output should confirm that the station file loads and validates successfully. The exact station count depends on the current `data/stations/stations.json` file.

## 7. If you only want to clean temporary files

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cleanup.ps1
```

This removes repo temp/cache clutter such as:

- `.tmp\pytest-cache`
- `.tmp\pytest-current`
- `__pycache__`
- `pytest-cache-files-*`
- `tmp*`

Pytest is configured to create new cache and temporary test output under `.tmp`. Older `pytest-cache-files-*` or `tmp*` folders can be permission-locked by Windows; if cleanup reports warnings for them, they are stale untracked local folders.

## 8. If the app opens but the station cards load slowly

This is usually caused by one or more of these:

- browser geolocation delay
- live routing mode waiting on ORS or OSRM
- first-time route calculation for many stations when `ROUTING_MODE=live`

What to do:

- wait for location access to finish
- make sure internet is working
- use `ROUTING_MODE=estimate` for fast local demos
- refresh once after the first successful load
- keep the server running so the in-memory route cache can help

## 9. If the page does not reflect code changes

Do this:

1. stop Flask with `Ctrl+C`
2. run `python app.py` again
3. hard refresh the browser with `Ctrl+F5`

## 10. If dependency install fails

Try upgrading pip first:

```powershell
python -m pip install --upgrade pip
pip install -r libraries/python.txt
```

Or with `py`:

```powershell
py -m pip install --upgrade pip
py -m pip install -r libraries/python.txt
```

## 11. If port `5000` is already in use

Temporary option:

```powershell
$env:FLASK_PORT="5001"
python app.py
```

Then open:

```text
http://127.0.0.1:5001
```

## 12. If you need the bundled runtime used in this workspace

In this workspace, a bundled Python runtime has been used successfully at:

```text
C:\Users\ANDREI\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
```

You can run the app with:

```powershell
$env:PYTHONPATH='.vendor'
& 'C:\Users\ANDREI\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' app.py
```

This is useful if local Python is missing or broken, but it is specific to this machine/workspace.

## 13. Recommended everyday commands

Run app:

```powershell
python app.py
```

Validate stations:

```powershell
python scripts\validate_stations.py
```

Clean temp files:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cleanup.ps1
```

Run Python lint:

```powershell
python -m ruff check .
```

Run CSS lint:

```powershell
npm run lint:css
```
