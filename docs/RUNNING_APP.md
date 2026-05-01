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
pip install -r requirements.txt
```

Create your environment file if needed:

```powershell
copy .env.example .env
```

Run the app:

```powershell
python app.py
```

Open:

```text
http://127.0.0.1:5000
```

If the Map opens but recommendations do not appear, make sure the browser allowed current location access and the OpenRouteService API key is configured. For full system testing, both are required.

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
py -m pip install -r requirements.txt
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
pip install -r requirements.txt
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

- `.tmp`
- `__pycache__`
- `pytest-cache-files-*`
- `tmp*`

## 8. If the app opens but the station cards load slowly

This is usually caused by one or more of these:

- browser geolocation delay
- slow internet for ORS or OSRM routing
- first-time route calculation for many stations

What to do:

- wait for location access to finish
- make sure internet is working
- refresh once after the first successful load
- keep the server running so route cache can help

## 9. If the page does not reflect code changes

Do this:

1. stop Flask with `Ctrl+C`
2. run `python app.py` again
3. hard refresh the browser with `Ctrl+F5`

## 10. If dependency install fails

Try upgrading pip first:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Or with `py`:

```powershell
py -m pip install --upgrade pip
py -m pip install -r requirements.txt
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
