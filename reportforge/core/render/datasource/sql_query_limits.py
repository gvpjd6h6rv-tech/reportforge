from __future__ import annotations

"""
sql_query_limits — resolves and enforces the timeout and max_rows a report
query is allowed to run with. Nothing else.

Responsibility: given whatever timeout/max_rows a caller requested (which
may be missing, zero, negative, or absurdly large), return a safe value —
every query executed through this datasource path must carry a bounded
timeout and a bounded row cap, never "unlimited".

Does NOT:
  - execute SQL
  - know about SQL syntax, statement kind, or procedure names
  - talk to a database driver directly (callers pass the resolved timeout
    into the driver where the driver supports it, and pass rows already
    fetched through truncate_rows() before returning them to a caller)
"""

DEFAULT_TIMEOUT_SECONDS = 30
MAX_TIMEOUT_SECONDS = 120

DEFAULT_MAX_ROWS = 1000
MAX_MAX_ROWS = 10_000


def resolve_timeout(requested: float | int | None) -> float:
    if requested is None:
        return float(DEFAULT_TIMEOUT_SECONDS)
    try:
        value = float(requested)
    except (TypeError, ValueError):
        return float(DEFAULT_TIMEOUT_SECONDS)
    if value <= 0:
        return float(DEFAULT_TIMEOUT_SECONDS)
    return min(value, float(MAX_TIMEOUT_SECONDS))


def resolve_max_rows(requested: int | None) -> int:
    if requested is None:
        return DEFAULT_MAX_ROWS
    try:
        value = int(requested)
    except (TypeError, ValueError):
        return DEFAULT_MAX_ROWS
    if value <= 0:
        return DEFAULT_MAX_ROWS
    return min(value, MAX_MAX_ROWS)


def truncate_rows(rows: list, max_rows: int) -> list:
    if not rows:
        return rows
    return rows[:max_rows]
