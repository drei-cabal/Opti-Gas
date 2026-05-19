from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
TMP_DIR = ROOT_DIR / ".tmp"
RUNTIME_TMP_DIR = TMP_DIR / "runtime"
PYCACHE_DIR = TMP_DIR / "pycache"

for directory in (TMP_DIR, RUNTIME_TMP_DIR, PYCACHE_DIR):
    directory.mkdir(parents=True, exist_ok=True)

# Centralize Python-generated temp files in the repo-local .tmp folder.
for env_name in ("TMP", "TEMP", "TMPDIR"):
    os.environ[env_name] = str(RUNTIME_TMP_DIR)

tempfile.tempdir = str(RUNTIME_TMP_DIR)
sys.pycache_prefix = str(PYCACHE_DIR)
