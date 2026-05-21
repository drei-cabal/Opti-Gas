from __future__ import annotations  # Enable postponed evaluation of type annotations.

import copy  # Copy cached payloads so callers cannot mutate shared cache data.
import threading  # Coordinate access to the shared in-memory cache stores.
from pathlib import Path  # Represent file paths used as cache keys.

from utils.data.models import StationCollection  # Reuse the data-layer collection type.

type CacheKey = dict[str, int]
type CacheStore = dict[Path, dict[str, object]]

_cache_lock = threading.Lock()


# Build the metadata key used to detect whether a cached file is still current.
def file_cache_key(path: Path) -> CacheKey:
    stat = path.stat()
    return {"mtime_ns": stat.st_mtime_ns, "size": stat.st_size}


# Return a deep copy of cached data when the file metadata still matches.
def get_cached(
    path: Path,
    cache: CacheStore,
    cache_key: CacheKey,
) -> StationCollection | None:
    with _cache_lock:
        cached = cache.get(path)
        if cached and cached.get("mtime_ns") == cache_key["mtime_ns"] and cached.get(
            "size"
        ) == cache_key["size"]:
            return copy.deepcopy(cached["data"])
    return None


# Store a deep copy of file-backed data under its current metadata key.
def set_cached(
    path: Path,
    cache: CacheStore,
    cache_key: CacheKey,
    data: StationCollection,
) -> None:
    with _cache_lock:
        cache[path] = {**cache_key, "data": copy.deepcopy(data)}
