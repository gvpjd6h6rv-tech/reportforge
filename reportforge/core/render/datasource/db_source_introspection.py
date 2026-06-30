from __future__ import annotations

from .db_source_engine import HAS_SA
from .db_source_queries import sa_query, sqlite_query, sqlite_target_path


def build_mssql_url(host: str, port: int, database: str, username: str, password: str,
                    driver: str = "ODBC Driver 17 for SQL Server") -> str:
    from urllib.parse import quote_plus
    return (f"mssql+pyodbc://{quote_plus(username)}:{quote_plus(password)}"
            f"@{host}:{port}/{database}?driver={quote_plus(driver)}")


def ping_structured(host: str, port: int, database: str, username: str, password: str,
                    driver: str = "ODBC Driver 17 for SQL Server") -> dict:
    import time
    url = build_mssql_url(host, port, database, username, password, driver)
    t0 = time.monotonic()
    ok = ping(url)
    latency_ms = round((time.monotonic() - t0) * 1000, 1)
    if ok:
        return {"ok": True, "message": f"Conectado a {host}/{database}", "latency_ms": latency_ms}
    return {"ok": False, "message": f"No se pudo conectar a {host}:{port}/{database}", "latency_ms": latency_ms}


def ping(url: str) -> bool:
    try:
        if url.startswith("sqlite"):
            sqlite_query(sqlite_target_path(url), "SELECT 1", {})
        else:
            sa_query(url, "SELECT 1", {})
        return True
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
