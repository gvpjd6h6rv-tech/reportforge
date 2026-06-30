"""
db_source_pymssql.py — pymssql driver for RF SQL datasources (SQL Server / SAP B1).

Security: password is accepted in spec dict and passed directly to pymssql.connect().
It is never concatenated into SQL, never logged, never returned in responses.
"""
from __future__ import annotations

import re


def connect(spec: dict):
    """
    Open a pymssql connection from a structured spec dict.
    Required keys: host, database, username, password
    Optional keys: port (default 1433), timeout (default 10)

    Import happens here (not at module level) so that a server process started
    before pymssql was installed can still connect after a pip install, without
    needing a restart.  Python's import system caches successes in sys.modules,
    so the cost after the first successful import is a single dict lookup.

    Password is passed directly to the driver — never logged.
    """
    try:
        import pymssql as _pymssql
    except ImportError:
        raise RuntimeError("pymssql not installed. Run: pip install pymssql")
    timeout = int(spec.get("timeout", 10))
    return _pymssql.connect(
        server=spec["host"],
        port=int(spec.get("port", 1433)),
        user=spec["username"],
        password=spec["password"],
        database=spec["database"],
        as_dict=True,
        login_timeout=timeout,
        timeout=timeout,
    )


def query(spec: dict, sql: str, params: dict) -> list[dict]:
    """
    Execute sql against a pymssql datasource. Returns list[dict].
    Converts SQLAlchemy :name params to %(name)s style (pymssql format).
    Password never appears in any exception message re-raised here.
    """
    converted_sql = re.sub(r':(\w+)', r'%(\1)s', sql)
    conn = connect(spec)
    try:
        cursor = conn.cursor()
        cursor.execute(converted_sql, params)
        rows = cursor.fetchall()
        return list(rows) if rows else []
    finally:
        conn.close()


def ping(spec: dict) -> bool:
    """Test connection by executing SELECT 1. True = reachable."""
    try:
        conn = connect(spec)
        cursor = conn.cursor()
        cursor.execute("SELECT 1 AS ok")
        conn.close()
        return True
    except Exception:
        return False
