from __future__ import annotations

from pathlib import Path

from .db_source_cache import _CACHE, _DEFAULT_TTL, cache_get as _cache_get, cache_invalidate, cache_key as _cache_key, cache_set as _cache_set
from .db_source_engine import HAS_SA, _ENGINES, get_engine as _get_engine
from .db_source_errors import DbSourceError
from .db_source_introspection import list_tables, ping, table_schema
from .db_source_loader import load_spec
from .db_source_queries import sa_query as _sa_query, sqlite_query as _sqlite_query, sqlite_target_path
from .db_source_registry import _REGISTRY, get_registered, list_registered, query_registered, register, unregister


class DbSource:
    """
    Public facade for database datasources.
    All behavior is delegated to thin owner modules.
    """

    @classmethod
    def load(cls, spec: dict, base_path: Path | None = None) -> dict:
        return load_spec(spec, base_path)

    @classmethod
    def ping(cls, url: str) -> bool:
        return ping(url)

    @classmethod
    def list_tables(cls, url: str) -> list[str]:
        return list_tables(url)

    @classmethod
    def table_schema(cls, url: str, table: str) -> list[dict]:
        return table_schema(url, table)


# Legacy compatibility exports used by existing tests and callers.
cache_key = _cache_key
cache_get = _cache_get
cache_set = _cache_set
sqlite_query = _sqlite_query
sa_query = _sa_query
get_engine = _get_engine
