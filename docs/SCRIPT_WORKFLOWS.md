# Script Workflows

The `scripts/` folder contains maintenance commands. These scripts do not run automatically during normal Flask app usage. Run them from the terminal only when their condition applies.

## Quick Reference

| Situation | Run |
| --- | --- |
| Before demo, commit, or push | `python scripts\validate_stations.py` then `python -m pytest` |
| After editing `data/stations/stations.json` | `python scripts\validate_stations.py` then `python -m pytest` |
| After updating a price from terminal | `python scripts\update_prices.py "Station Name" "Fuel Type" 65.50`, then validate and test |
| When importing station candidates from OpenStreetMap | `python scripts\seed_stations_from_osm.py`, then `python scripts\audit_osm_seed.py` |
| When cleaning local temp/cache files | `powershell -ExecutionPolicy Bypass -File .\scripts\cleanup.ps1` |

## 1. Normal Check Before Demo Or Commit

Use this when you want to confirm the current project still works before a demo, commit, or GitHub push.

```powershell
python scripts\validate_stations.py
python -m pytest
```

Condition:

- Run after code changes.
- Run after station data changes.
- Run before pushing important changes to GitHub.

## 2. After Manually Editing Station Data

Use this after changing:

```text
data/stations/stations.json
```

Run:

```powershell
python scripts\validate_stations.py
python -m pytest
```

Condition:

- Always run station validation after editing station data.
- Run tests when the edit could affect app behavior, recommendations, price updates, or station display.

If validation is skipped, broken station data may only be caught later when the app loads stations or handles a recommendation request.

## 3. Updating A Station Price From Terminal

Use this only when you want to update a station price without using the web app.

```powershell
python scripts\update_prices.py "Station Name" "Fuel Type" 65.50
python scripts\validate_stations.py
python -m pytest
```

Condition:

- Run only when intentionally changing a station price.
- Replace `"Station Name"`, `"Fuel Type"`, and `65.50` with real values.

Example:

```powershell
python scripts\update_prices.py "Petron Tagum" "Diesel" 58.75
python scripts\validate_stations.py
python -m pytest
```

## 4. Importing New Station Candidates From OpenStreetMap

Use this only when refreshing or adding possible station locations from OpenStreetMap.

```powershell
python scripts\seed_stations_from_osm.py
python scripts\audit_osm_seed.py
```

Then manually review:

```text
data/stations/stations.osm.seed.json
data/stations/stations.osm.audit.csv
```

After review, copy only approved station entries into:

```text
data/stations/stations.json
```

Then run:

```powershell
python scripts\validate_stations.py
python -m pytest
```

Condition:

- Use this workflow only when adding or refreshing station data from OpenStreetMap.
- Do not copy OSM results directly into the live station file without review.

## 5. Cleaning Temporary Files

Use this when you want to remove local cache and temporary folders.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cleanup.ps1
```

Condition:

- Optional after testing.
- Optional when the folder has cache files such as `.tmp\pytest-cache`, `.tmp\pytest-current`, `__pycache__`, or `.pytest_cache`.
- This does not validate the app or station data.
- Pytest cache and temporary test folders are configured to stay under `.tmp`.
- Older `pytest-cache-files-*` or `tmp*` folders may be permission-locked by Windows. The cleanup script reports those as warnings and leaves them untracked.

To also remove the `archive` folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cleanup.ps1 -IncludeArchive
```

Use `-IncludeArchive` only when the archive contents are no longer needed.

## Recommended Default

Most of the time, use only:

```powershell
python scripts\validate_stations.py
python -m pytest
```

Run the OSM scripts only when importing station candidates. Run cleanup only when you want to remove local temporary files.
