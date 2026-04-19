from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


class DataSourceError(RuntimeError):
    pass


class DataSource:
    """
    Resolves a dataSource spec to a Python dict.

    Supported specs:
      - dict:              used as-is
      - Path / str file:   reads JSON
      - "http(s)://...":   fetches REST API returning JSON
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
                return cls._fetch_rest(
                    spec["url"],
                    spec.get("headers", {}),
                    spec.get("method", "GET"),
                    timeout,
                )
            if kind in ("db", "sqlite", "database"):
                from .db_source import DbSource

                return DbSource.load(spec)
            if kind == "multi":
                from .multi_dataset import MultiDataset

                return MultiDataset(spec.get("datasets", {})).merged()
            return spec

        if isinstance(spec, (str, Path)):
            text = str(spec)
            if text.startswith("http://") or text.startswith("https://"):
                return cls._fetch_rest(text, {}, "GET", timeout)
            return cls._load_file(text)

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
    def _fetch_rest(url: str, headers: dict, method: str = "GET", timeout: int = 10) -> dict:
        req = urllib.request.Request(url, method=method.upper())
        req.add_header("Accept", "application/json")
        for key, value in headers.items():
            req.add_header(key, value)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body)
        except urllib.error.URLError as e:
            raise DataSourceError(f"Failed to fetch {url}: {e}") from e
        except json.JSONDecodeError as e:
            raise DataSourceError(f"Non-JSON response from {url}: {e}") from e

