# core/render/datasource/db_source.py
# SQL Datasource — Phase 3
# Provides direct database connectivity via sqlite3 (built-in) or
# SQLAlchemy (optional, covers PostgreSQL / MySQL / MSSQL / Oracle).
from __future__ import annotations
import sqlite3, json, hashlib, time
from pathlib import Path
from typing import Any

# ── Optional SQLAlchemy ───────────────────────────────────────────────────
try:
    import sqlalchemy
    from sqlalchemy import create_engine, text as sa_text
    HAS_SA = True
except ImportError:
    HAS_SA = False


# ── In-process query cache (TTL-based) ───────────────────────────────────
_CACHE: dict[str, tuple[float, Any]] = {}  # key → (expires_at, result)
_DEFAULT_TTL = 300  # 5 minutes


def _cache_key(url: str, query: str, params: dict) -> str:
    raw = json.dumps({"url": url, "query": query, "params": params}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _cache_get(key: str) -> Any | None:
    if key in _CACHE:
        expires, val = _CACHE[key]
        if time.time() < expires:
            return val
        del _CACHE[key]
    return None


def _cache_set(key: str, val: Any, ttl: int = _DEFAULT_TTL) -> None:
    _CACHE[key] = (time.time() + ttl, val)


def cache_invalidate(url: str | None = None) -> int:
    """Invalidate all cache entries (or those matching url). Returns count removed."""
    if url is None:
        n = len(_CACHE)
        _CACHE.clear()
        return n
    keys = [k for k in list(_CACHE) if url in k]
    for k in keys:
        _CACHE.pop(k, None)
    return len(keys)


# ── Connection pool (SQLAlchemy engines, keyed by URL) ───────────────────
_ENGINES: dict[str, Any] = {}


def _get_engine(url: str):
    if not HAS_SA:
        raise RuntimeError("SQLAlchemy not installed. Run: pip install sqlalchemy")
    if url not in _ENGINES:
        _ENGINES[url] = create_engine(
            url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 10} if "postgresql" in url or "mysql" in url else {},
        )
    return _ENGINES[url]


# ── Low-level query helpers ───────────────────────────────────────────────

def _rows_to_dicts(cursor) -> list[dict]:
    """Convert cursor result to list of dicts."""
    cols = [d[0] for d in cursor.description] if cursor.description else []
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def _sqlite_query(db_path: str, query: str, params: dict) -> list[dict]:
    """Execute query on a SQLite file or :memory:."""
    path = ":memory:" if db_path in (":memory:", "") else db_path
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(query, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def _sa_query(url: str, query: str, params: dict) -> list[dict]:
    """Execute query via SQLAlchemy (any supported dialect)."""
    engine = _get_engine(url)
    with engine.connect() as conn:
        result = conn.execute(sa_text(query), params)
        cols = list(result.keys())
        return [dict(zip(cols, row)) for row in result.fetchall()]


# ── Public API ────────────────────────────────────────────────────────────

class DbSource:
    """
    Execute SQL queries against any supported database.

    Spec format (used in layout "dataSource" field)::

        {
          "type": "db",
          "url": "sqlite:///path/to/db.sqlite3",   # SQLAlchemy URL
          "query": "SELECT * FROM orders WHERE year = :year",
          "params": {"year": 2024},
          "ttl": 300,          # cache seconds (0 = no cache)
          "dataset": "items"   # key for the returned list (default "items")
        }

    For plain SQLite files without SQLAlchemy::

        {
          "type": "sqlite",
          "path": "path/to/db.sqlite3",
          "query": "SELECT * FROM orders",
          "params": {}
        }
    """

    @classmethod
    def load(cls, spec: dict, base_path: Path | None = None) -> dict:
        """
        Execute spec and return dict with "items" (and optionally other keys).
        """
        kind   = spec.get("type", "db")
        query  = spec.get("query", "").strip()
        params = spec.get("params") or {}
        ttl    = int(spec.get("ttl", _DEFAULT_TTL))
        dataset= spec.get("dataset", "items")

        if not query:
            return {dataset: []}

        # Resolve SQLite path
        if kind == "sqlite":
            db_path = spec.get("path", ":memory:")
            if base_path and not Path(db_path).is_absolute():
                db_path = str(base_path / db_path)
            url = db_path  # not a real URL, just the path
        else:
            url = spec.get("url", "")
            if not url:
                raise DbSourceError("db datasource requires 'url'")

        # Check cache
        cache_key = _cache_key(url, query, params)
        if ttl > 0:
            cached = _cache_get(cache_key)
            if cached is not None:
                return {dataset: cached}

        # Execute
        try:
            if kind == "sqlite" or url.startswith("sqlite"):
                # Extract file path from sqlite:/// URL if needed
                if url.startswith("sqlite:///"):
                    db_path = url[10:]
                elif url.startswith("sqlite:///:memory:"):
                    db_path = ":memory:"
                rows = _sqlite_query(db_path, query, params)
            else:
                rows = _sa_query(url, query, params)
        except Exception as e:
            raise DbSourceError(f"Query failed [{url}]: {e}") from e

        if ttl > 0:
            _cache_set(cache_key, rows, ttl)

        return {dataset: rows}

    @classmethod
    def ping(cls, url: str) -> bool:
        """Check if a connection can be established. Returns True/False."""
        try:
            if url.startswith("sqlite"):
                db_path = url[10:] if url.startswith("sqlite:///") else ":memory:"
                _sqlite_query(db_path, "SELECT 1", {})
            else:
                _sa_query(url, "SELECT 1", {})
            return True
        except Exception:
            return False

    @classmethod
    def list_tables(cls, url: str) -> list[str]:
        """Return list of table names for the given connection."""
        if url.startswith("sqlite"):
            db_path = url[10:] if url.startswith("sqlite:///") else ":memory:"
            rows = _sqlite_query(db_path,
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", {})
            return [r["name"] for r in rows]
        if HAS_SA:
            engine = _get_engine(url)
            from sqlalchemy import inspect as sa_inspect
            inspector = sa_inspect(engine)
            return inspector.get_table_names()
        return []

    @classmethod
    def table_schema(cls, url: str, table: str) -> list[dict]:
        """
        Return column schema for a table.
        Returns list of {"name": ..., "type": ..., "nullable": ...}
        """
        if url.startswith("sqlite"):
            db_path = url[10:] if url.startswith("sqlite:///") else ":memory:"
            rows = _sqlite_query(db_path, f"PRAGMA table_info({table})", {})
            return [{"name": r["name"], "type": r["type"],
                     "nullable": not r["notnull"], "pk": bool(r["pk"])}
                    for r in rows]
        if HAS_SA:
            engine = _get_engine(url)
            from sqlalchemy import inspect as sa_inspect
            inspector = sa_inspect(engine)
            cols = inspector.get_columns(table)
            return [{"name": c["name"], "type": str(c["type"]),
                     "nullable": c.get("nullable", True)} for c in cols]
        return []


class DbSourceError(RuntimeError):
    pass


# ── Registry of named datasources (used by API server) ────────────────────

_REGISTRY: dict[str, dict] = {}  # alias → spec


def register(alias: str, spec: dict) -> None:
    """Register a named datasource for use by alias in layouts."""
    _REGISTRY[alias] = spec


def unregister(alias: str) -> bool:
    return bool(_REGISTRY.pop(alias, None))


def list_registered() -> list[dict]:
    return [{"alias": k, **v} for k, v in _REGISTRY.items()]


def get_registered(alias: str) -> dict | None:
    return _REGISTRY.get(alias)


def query_registered(alias: str, query: str | None = None,
                     params: dict | None = None) -> list[dict]:
    """Execute a query against a registered datasource."""
    spec = _REGISTRY.get(alias)
    if not spec:
        raise DbSourceError(f"No registered datasource: {alias!r}")
    run_spec = dict(spec)
    if query:
        run_spec["query"] = query
    if params:
        run_spec["params"] = params
    result = DbSource.load(run_spec)
    return result.get(run_spec.get("dataset", "items"), [])
