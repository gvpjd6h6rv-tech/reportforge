from __future__ import annotations

import logging

from .db_source_engine import HAS_SA
from .db_source_queries import sqlite_query, sqlite_target_path

_log = logging.getLogger(__name__)


def ping_structured(host: str, port: int, database: str, username: str, password: str,
                    **_kwargs) -> dict:
    """
    Test a SQL Server connection via pymssql. Returns {ok, message, latency_ms[, details]}.

    Uses connect() directly so the actual exception type and message are captured
    and returned in details.debugCode (sanitized — password replaced with ***).
    """
    import time
    from .db_source_pymssql import connect as _connect

    spec = {"host": host, "port": int(port), "database": database,
            "username": username, "password": password}
    t0 = time.monotonic()
    try:
        conn = _connect(spec)
        cursor = conn.cursor()
        cursor.execute("SELECT 1 AS ok")
        conn.close()
        latency_ms = round((time.monotonic() - t0) * 1000, 1)
        return {"ok": True, "message": f"Conectado a {host}/{database}", "latency_ms": latency_ms}
    except Exception as exc:
        latency_ms = round((time.monotonic() - t0) * 1000, 1)
        exc_type = type(exc).__name__
        raw_msg = str(exc)
        safe_msg = raw_msg.replace(password, "***") if password else raw_msg
        _log.warning("SQL ping [%s:%s/%s] %s: %s", host, port, database, exc_type, safe_msg)
        return {
            "ok": False,
            "message": f"No se pudo conectar a {host}:{port}/{database}",
            "latency_ms": latency_ms,
            "details": {"debugCode": f"{exc_type}: {safe_msg}"},
        }


def ping(url: str) -> bool:
    """Ping a SQLite datasource by URL. For SQL Server use ping_structured() instead."""
    try:
        if url.startswith("sqlite"):
            sqlite_query(sqlite_target_path(url), "SELECT 1", {})
            return True
        return False
    except Exception:
        return False


def list_tables(url: str) -> list[str]:
    if url.startswith("sqlite"):
        rows = sqlite_query(sqlite_target_path(url),
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", {})
        return [r["name"] for r in rows]
    if HAS_SA:
        from .db_source_engine import get_engine
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(get_engine(url))
        return inspector.get_table_names()
    return []


def table_schema(url: str, table: str) -> list[dict]:
    if url.startswith("sqlite"):
        rows = sqlite_query(sqlite_target_path(url), f"PRAGMA table_info({table})", {})
        return [{"name": r["name"], "type": r["type"], "nullable": not r["notnull"], "pk": bool(r["pk"])} for r in rows]
    if HAS_SA:
        from .db_source_engine import get_engine
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(get_engine(url))
        cols = inspector.get_columns(table)
        return [{"name": c["name"], "type": str(c["type"]), "nullable": c.get("nullable", True)} for c in cols]
    return []
