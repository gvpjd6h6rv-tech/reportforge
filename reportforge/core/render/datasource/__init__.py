# core/render/datasource.py
# Live data sources — REST API, JSON file, multiple datasets.
from __future__ import annotations
import json, urllib.request, urllib.error
from pathlib import Path
from typing import Any


class DataSourceError(RuntimeError):
    pass


class DataSource:
    """
    Resolves a dataSource spec to a Python dict.
    
    Supported specs:
      - dict:              used as-is
      - Path / str file:  reads JSON
      - "http(s)://...":  fetches REST API returning JSON
      - {"type":"json","path":"..."}
      - {"type":"rest","url":"...","headers":{...}}
      - {"type":"inline","data":{...}}
    """

    @classmethod
    def load(cls, spec: Any, timeout: int = 10) -> dict:
        if isinstance(spec, dict):
            kind = spec.get("type", "inline")
            if kind == "inline":
                return spec.get("data", spec)
            if kind in ("json", "file"):
                return cls._load_file(spec["path"])
            if kind == "rest":
                return cls._fetch_rest(spec["url"],
                                       spec.get("headers", {}),
                                       spec.get("method", "GET"),
                                       timeout)
            if kind in ("db", "sqlite", "database"):
                from .db_source import DbSource
                return DbSource.load(spec)
            if kind == "multi":
                # Multiple named datasets: {"type":"multi","datasets":{...}}
                return {k: cls.load(v, timeout)
                        for k, v in spec.get("datasets", {}).items()}
            # Fallback: treat as inline data
            return spec

        if isinstance(spec, (str, Path)):
            s = str(spec)
            if s.startswith("http://") or s.startswith("https://"):
                return cls._fetch_rest(s, {}, "GET", timeout)
            return cls._load_file(s)

        raise DataSourceError(f"Cannot resolve data source: {type(spec).__name__}")

    @staticmethod
    def _load_file(path: str) -> dict:
        p = Path(path)
        if not p.exists():
            raise DataSourceError(f"Data file not found: {path}")
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise DataSourceError(f"Invalid JSON in {path}: {e}") from e

    @staticmethod
    def _fetch_rest(url: str, headers: dict, method: str = "GET",
                    timeout: int = 10) -> dict:
        req = urllib.request.Request(url, method=method.upper())
        req.add_header("Accept", "application/json")
        for k, v in headers.items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body)
        except urllib.error.URLError as e:
            raise DataSourceError(f"Failed to fetch {url}: {e}") from e
        except json.JSONDecodeError as e:
            raise DataSourceError(f"Non-JSON response from {url}: {e}") from e


class MultiDataset:
    """
    Manages multiple named datasets within a single report.
    Datasets can be accessed as: {dataset1.fieldName}, {dataset2.total}
    """
    def __init__(self, datasets: dict[str, Any]):
        self._datasets: dict[str, dict] = {}
        for name, spec in datasets.items():
            try:
                self._datasets[name] = DataSource.load(spec)
            except DataSourceError as e:
                self._datasets[name] = {"error": str(e), "items": []}

    def get(self, name: str) -> dict:
        return self._datasets.get(name, {})

    def items(self, name: str) -> list:
        return self._datasets.get(name, {}).get("items", [])

    def merged(self) -> dict:
        """Return flat dict with all datasets merged under their names."""
        return dict(self._datasets)
