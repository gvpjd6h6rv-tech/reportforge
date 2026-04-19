from __future__ import annotations

import sqlite3

try:
    from sqlalchemy import text as sa_text
except ImportError:
    sa_text = None

from .db_source_engine import get_engine


def sqlite_target_path(url: str) -> str:
    if url.startswith("sqlite:///"):
        return url[10:]
    if url.startswith("sqlite:///:memory:"):
        return ":memory:"
    return ":memory:"


def sqlite_query(db_path: str, query: str, params: dict) -> list[dict]:
    path = ":memory:" if db_path in (":memory:", "") else db_path
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(query, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def sa_query(url: str, query: str, params: dict) -> list[dict]:
    if sa_text is None:
        raise RuntimeError("SQLAlchemy not installed. Run: pip install sqlalchemy")
    engine = get_engine(url)
    with engine.connect() as conn:
        result = conn.execute(sa_text(query), params)
        cols = list(result.keys())
        return [dict(zip(cols, row)) for row in result.fetchall()]
