# core/render/datasource/live_source.py
# Live data source: fetch data from REST APIs or JSON files at render time.
from __future__ import annotations
import json, time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


class LiveDataSource:
    """
    Fetches and caches data from live sources.

    Usage in layout:
        "dataSource": {
            "type": "rest",
            "url": "https://api.example.com/sales",
            "method": "GET",
            "headers": {"Authorization": "Bearer TOKEN"},
            "params": {"year": "{param.year}"},
            "dataPath": "data.items",
            "timeout": 10,
            "cache": 60            # seconds, 0 = no cache
        }

    Or for JSON file:
        "dataSource": {
            "type": "file",
            "path": "data/sales_2025.json",
            "dataPath": "items"
        }

    Or shorthand URL string:
        "dataSource": "https://api.example.com/sales"
    """

    _cache: dict[str, tuple[float, Any]] = {}  # key → (ts, data)

    def __init__(self, definition: dict | str | None = None):
        if isinstance(definition, str):
            definition = {"type": "rest", "url": definition}
        self._defn = definition or {}

    def fetch(self, params: dict | None = None) -> Any:
        """Fetch data, returning list or dict."""
        src_type = self._defn.get("type", "rest")
        if src_type in ("rest", "api", "http", "https"):
            return self._fetch_rest(params or {})
        if src_type in ("file", "json"):
            return self._fetch_file()
        raise ValueError(f"Unknown data source type: {src_type!r}")

    def fetch_as_report_data(self, params: dict | None = None) -> dict:
        """Fetch and wrap in report data structure."""
        raw = self.fetch(params)
        if isinstance(raw, list):
            return {"items": raw}
        if isinstance(raw, dict):
            return raw
        return {"items": []}

    # ── REST ──────────────────────────────────────────────────────

    def _fetch_rest(self, params: dict) -> Any:
        import urllib.request, urllib.parse

        url     = self._interpolate(self._defn.get("url", ""), params)
        method  = self._defn.get("method", "GET").upper()
        headers = self._defn.get("headers", {})
        timeout = int(self._defn.get("timeout", 10))
        ttl     = int(self._defn.get("cache", 0))
        q_params = self._defn.get("params", {})
        data_path = self._defn.get("dataPath", "")

        # Add query params
        if q_params:
            q = {k: self._interpolate(str(v), params) for k, v in q_params.items()}
            url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(q)

        # Check cache
        cache_key = f"{method}:{url}"
        if ttl > 0 and cache_key in self._cache:
            ts, cached = self._cache[cache_key]
            if time.time() - ts < ttl:
                return cached

        # Build request
        req = urllib.request.Request(url, method=method)
        for k, v in headers.items():
            req.add_header(k, v)
        if not headers.get("Accept"):
            req.add_header("Accept", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            raise RuntimeError(f"LiveDataSource fetch failed: {e}") from e

        # Navigate data path
        result = _dig(raw, data_path) if data_path else raw

        # Store in cache
        if ttl > 0:
            self._cache[cache_key] = (time.time(), result)

        return result

    # ── File ──────────────────────────────────────────────────────

    def _fetch_file(self) -> Any:
        path_str  = self._defn.get("path", "")
        data_path = self._defn.get("dataPath", "")
        encoding  = self._defn.get("encoding", "utf-8")

        path = Path(path_str)
        raw  = json.loads(path.read_text(encoding=encoding))
        return _dig(raw, data_path) if data_path else raw

    # ── Helpers ───────────────────────────────────────────────────

    def _interpolate(self, text: str, params: dict) -> str:
        """Replace {param.X} placeholders in URL / headers."""
        import re
        def _repl(m):
            key = m.group(1)
            if key.startswith("param."):
                return str(params.get(key[6:], m.group(0)))
            return str(params.get(key, m.group(0)))
        return re.sub(r'\{([^{}]+)\}', _repl, text)

    @classmethod
    def clear_cache(cls) -> None:
        cls._cache.clear()


def resolve_data_source(layout: dict, runtime_params: dict | None = None) -> dict | None:
    """
    If layout has a 'dataSource' key, fetch data from it.
    Returns report data dict or None if no dataSource defined.
    """
    defn = layout.get("dataSource")
    if not defn:
        return None
    source = LiveDataSource(defn)
    return source.fetch_as_report_data(runtime_params or {})


def _dig(obj: Any, path: str) -> Any:
    if not path:
        return obj
    cur = obj
    for k in path.split("."):
        if isinstance(cur, dict): cur = cur.get(k)
        elif isinstance(cur, list) and k.isdigit(): cur = cur[int(k)]
        else: return obj
    return cur if cur is not None else obj
