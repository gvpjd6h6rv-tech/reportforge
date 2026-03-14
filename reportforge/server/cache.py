# server/cache.py
# In-memory layout cache — speeds up repeated renders of the same layout.
# Thread-safe with TTL expiry and tenant isolation.
from __future__ import annotations
import hashlib, json, threading, time
from typing import Any, Optional

_DEFAULT_TTL = 300      # 5 minutes
_MAX_ENTRIES = 512      # max cached layouts


class LayoutCache:
    """
    Thread-safe LRU layout cache with TTL.
    Keyed by sha256(layout_json) — tenant-isolated when tenant prefix added.
    """

    def __init__(self, ttl: int = _DEFAULT_TTL, max_entries: int = _MAX_ENTRIES):
        self._ttl        = ttl
        self._max        = max_entries
        self._store:  dict[str, dict] = {}   # key → {layout, ts}
        self._hits    = 0
        self._misses  = 0
        self._lock    = threading.RLock()

    # ── Public API ────────────────────────────────────────────────
    def get(self, key: str) -> Optional[dict]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self._misses += 1
                return None
            if time.monotonic() - entry["ts"] > self._ttl:
                del self._store[key]
                self._misses += 1
                return None
            self._hits += 1
            return entry["layout"]

    def set(self, key: str, layout: dict) -> None:
        with self._lock:
            if len(self._store) >= self._max:
                self._evict()
            self._store[key] = {"layout": layout, "ts": time.monotonic()}

    def invalidate(self, key: str) -> bool:
        with self._lock:
            return self._store.pop(key, None) is not None

    def clear(self, tenant: str = None) -> int:
        with self._lock:
            if tenant:
                keys = [k for k in self._store if k.startswith(f"{tenant}:")]
            else:
                keys = list(self._store.keys())
            for k in keys:
                del self._store[k]
            return len(keys)

    def stats(self) -> dict:
        with self._lock:
            total = self._hits + self._misses
            return {
                "entries":    len(self._store),
                "max":        self._max,
                "ttl_seconds":self._ttl,
                "hits":       self._hits,
                "misses":     self._misses,
                "hit_rate":   round(self._hits / total, 4) if total else 0.0,
            }

    # ── Cache key helpers ─────────────────────────────────────────
    @staticmethod
    def make_key(layout: dict | str, tenant: str = "default") -> str:
        if isinstance(layout, dict):
            raw = json.dumps(layout, sort_keys=True, ensure_ascii=False)
        else:
            raw = str(layout)
        digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
        return f"{tenant}:{digest}"

    @staticmethod
    def file_key(path: str, tenant: str = "default") -> str:
        return f"{tenant}:file:{hashlib.sha256(path.encode()).hexdigest()[:12]}"

    # ── Internal ──────────────────────────────────────────────────
    def _evict(self) -> None:
        """Remove oldest 10% of entries."""
        n_evict = max(1, self._max // 10)
        sorted_keys = sorted(self._store, key=lambda k: self._store[k]["ts"])
        for k in sorted_keys[:n_evict]:
            del self._store[k]


# Global singleton
_cache = LayoutCache()

def get_cache() -> LayoutCache:
    return _cache
