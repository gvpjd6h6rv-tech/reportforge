# core/render/features/datasets.py
# Multiple datasets support: primary + named auxiliary datasets.
# Each section/group can iterate a different dataset.
from __future__ import annotations
from typing import Any
import json
from pathlib import Path


class DatasetRegistry:
    """
    Holds multiple named datasets for a report.

    Layout usage:
        "datasets": {
            "items":     {"source": "inline", "data": [...]},
            "customers": {"source": "file",   "path": "customers.json"},
            "summary":   {"source": "api",    "url": "https://api/summary"},
        }

    Section usage:
        {"stype": "det", "iterates": "customers"}
    """

    def __init__(self, primary_data: dict,
                 dataset_defs: dict[str, dict] | None = None):
        self._primary = primary_data
        self._datasets: dict[str, list] = {
            "items": list(primary_data.get("items", [])),
        }
        # Load auxiliary datasets
        for name, defn in (dataset_defs or {}).items():
            try:
                self._datasets[name] = self._load(defn, primary_data)
            except Exception as e:
                print(f"[DatasetRegistry] Warning: dataset '{name}' failed: {e}")
                self._datasets[name] = []

    def _load(self, defn: dict, primary: dict) -> list:
        src = defn.get("source", "inline")
        if src == "inline":
            return list(defn.get("data", []))
        if src == "file":
            path = Path(defn["path"])
            raw  = json.loads(path.read_text(encoding="utf-8"))
            return raw if isinstance(raw, list) else raw.get("items", [])
        if src == "api":
            return _fetch_api(defn["url"], defn.get("headers", {}),
                              defn.get("dataPath", ""))
        if src == "path":
            # Reference into primary data via dot-path
            return _dig(primary, defn["path"])
        return []

    def get(self, name: str) -> list:
        """Return named dataset items."""
        if name in self._datasets:
            return self._datasets[name]
        # Try dot-path traversal into primary data
        result = _dig(self._primary, name)
        if isinstance(result, list):
            return result
        return []

    def names(self) -> list[str]:
        return list(self._datasets.keys())

    def inject_into_data(self, data: dict) -> dict:
        """Inject all datasets into data under 'datasets' key."""
        return {**data, "datasets": dict(self._datasets)}

    @property
    def primary(self) -> dict:
        return self._primary


def _dig(obj: Any, path: str) -> Any:
    cur = obj
    for k in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(k, [])
        else:
            return []
    return cur if isinstance(cur, list) else []


def _fetch_api(url: str, headers: dict, data_path: str) -> list:
    try:
        import urllib.request, urllib.error
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
        if data_path:
            raw = _dig(raw, data_path)
        return raw if isinstance(raw, list) else []
    except Exception as e:
        print(f"[DatasetRegistry] API fetch failed: {e}")
        return []
