# First-Time Setup for OPTI-GAS

This guide is for someone who pulled or cloned the project for the first time.

## 1. Clone the repository

```powershell
git clone https://github.com/drei-cabal/Opti-Gas.git
cd Opti-Gas
```

## 2. Install Python

Use Python `3.12` or newer.

Official download:

```text
https://www.python.org/downloads/
```

During installation on Windows:

- enable `Add python.exe to PATH`
- make sure `pip` is included

Verify installation:

```powershell
python --version
```

If `python` does not work, try:

```powershell
py --version
```

## 3. Create and activate a virtual environment

Using `python`:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

Or using `py`:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.venv\Scripts\Activate.ps1
```

## 4. Install project dependencies

```powershell
pip install -r libraries/python.txt
```

If you will run tests, linting, or dependency audits, also install the development dependencies:

```powershell
pip install -r libraries/python-dev.txt
```

If you will edit CSS or run CSS linting, install Node.js and then install the Node development tools:

```powershell
npm install
```

## 5. Create the environment file

Copy the sample file:

```powershell
copy .env.example .env
```

The app reads runtime settings from `.env`. `.env.example` is only a starter template for creating that local file.

## 6. Get an OpenRouteService API key

This project uses live-first routing for recommendation distance and time. OpenRouteService is the primary provider, OSRM is the secondary provider when ORS is unavailable, and a local Haversine-based estimate is used as the fallback.

Create an account on the OpenRouteService website:

```text
https://openrouteservice.org/
```

General process:

1. Create an account
2. Sign in
3. Go to the dashboard/API keys section
4. Create a key for directions/routing use
5. Copy the generated API key

## 7. Add the API key to `.env`

Open `.env` and set:

```env
ORS_API_KEY=your_real_api_key_here
ROUTING_MODE=live
```

You may also keep or adjust these if needed:

```env
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
FLASK_DEBUG=0
```

Important:

- never commit `.env`
- `.env.example` is safe to commit
- if you accidentally push a real key, rotate it immediately

## 8. Run the app

```powershell
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

## 9. Validate station data

Before editing or testing station data, run:

```powershell
python scripts\validate_stations.py
```

Expected success output should confirm that the station file loads and validates successfully. The exact station count depends on the current `data/stations/stations.json` file.

## 10. If Python is not available locally

This workspace has also been run using a bundled Python path on this machine:

```text
C:\Users\ANDREI\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
```

Run with:

```powershell
$env:PYTHONPATH='.vendor'
& 'C:\Users\ANDREI\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' app.py
```

This is machine-specific and should not be treated as the standard setup for other users.

## 11. Location access

For the best Map experience, the browser will ask for current location on first load. If location is blocked, the app still runs, but the team will not be able to fully test live Map recommendations until permission is granted.

After permission is granted, the Map keeps watching GPS while the page is open. When the user moves far enough to matter for station choice, the blue location marker should recalibrate and the recommendation list should refresh from the new position. If it does not, confirm that device location services are enabled and that the browser still allows location for `http://127.0.0.1:5000`.

## 12. Common first-time issues

### `python` not found

Use:

```powershell
py app.py
```

or reinstall Python with PATH enabled.

### API key missing

If `ORS_API_KEY` is empty, the app can still try OSRM. If neither ORS nor OSRM can return a route, recommendations use the local fallback route estimate. For a faster demo that skips live providers, set `ROUTING_MODE=estimate`.

### Slow first load

The first load may be slower because of:

- browser geolocation
- first route calculations for candidate stations
- network latency to ORS or OSRM before fallback estimates are used

Later refreshes should be faster because of browser-side session reuse and backend route caching.

### Port already in use

Run on another port:

```powershell
$env:FLASK_PORT="5001"
python app.py
```

Then open:

```text
http://127.0.0.1:5001
```

## 13. Recommended first-time command sequence

```powershell
git clone https://github.com/drei-cabal/Opti-Gas.git
cd Opti-Gas
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r libraries/python.txt
npm install
copy .env.example .env
python app.py
```
