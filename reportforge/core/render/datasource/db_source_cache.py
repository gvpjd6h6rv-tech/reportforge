from __future__ import annotations

import hashlib
import json
import time
from typing import Any

_CACHE: dict[str, tuple[float, Any]] = {}
_DEFAULT_TTL = 300


def cache_key(url: str, query: str, params: dict) -> str:
    raw = json.dumps({"url": url, "query": query, "params": params}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def cache_get(key: str) -> Any | None:
    if key in _CACHE:
        expires, val = _CACHE[key]
        if time.time() < expires:
            return val
        del _CACHE[key]
    return None


def cache_set(key: str, val: Any, ttl: int = _DEFAULT_TTL) -> None:
    _CACHE[key] = (time.time() + ttl, val)


def cache_invalidate(url: str | None = None) -> int:
    if url is None:
        n = len(_CACHE)
        _CACHE.clear()
        return n
    keys = [k for k in list(_CACHE) if url in k]
    for k in keys:
        _CACHE.pop(k, None)
    return len(keys)
