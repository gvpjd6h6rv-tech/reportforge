from __future__ import annotations

from pathlib import Path

from .db_source_cache import cache_get, cache_key, cache_set, _DEFAULT_TTL
from .db_source_errors import DbSourceError
from .db_source_queries import sa_query, sqlite_query


def load_spec(spec: dict, base_path: Path | None = None) -> dict:
    kind = spec.get("type", "db")
    query = spec.get("query", "").strip()
    params = spec.get("params") or {}
    ttl = int(spec.get("ttl", _DEFAULT_TTL))
    dataset = spec.get("dataset", "items")

    if not query:
        return {dataset: []}

    if kind == "sqlite":
        db_path = spec.get("path", ":memory:")
        if base_path and not Path(db_path).is_absolute():
            db_path = str(base_path / db_path)
        url = db_path
    else:
        url = spec.get("url", "")
        if not url:
            raise DbSourceError("db datasource requires 'url'")

    ckey = cache_key(url, query, params)
    if ttl > 0:
        cached = cache_get(ckey)
        if cached is not None:
            return {dataset: cached}

    try:
        if kind == "sqlite" or url.startswith("sqlite"):
            db_path = url
            if url.startswith("sqlite:///"):
                db_path = url[10:]
            elif url.startswith("sqlite:///:memory:"):
                db_path = ":memory:"
            rows = sqlite_query(db_path, query, params)
        else:
            rows = sa_query(url, query, params)
    except Exception as e:
        raise DbSourceError(f"Query failed [{url}]: {e}") from e

    if ttl > 0:
        cache_set(ckey, rows, ttl)

    return {dataset: rows}
