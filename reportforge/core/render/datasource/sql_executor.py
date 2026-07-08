from __future__ import annotations

import time
from typing import Any

from .db_source_errors import DbSourceError
from .db_source_loader import load_spec
from .sql_error_sanitizer import sanitize_exception
from .sql_execution_result import SqlExecutionResult
from .sql_query_limits import resolve_max_rows, resolve_timeout, truncate_rows
from .sql_safety_guard import check as guard_check

"""
sql_executor — orchestrates SAFE execution of already-prepared,
already-parameterized SQL for report data sources. Nothing else.

Responsibility:
  - call sql_safety_guard.check() on the prepared SQL; refuse to run
    anything it rejects (never bypassed, never duplicated here).
  - resolve timeout/max_rows via sql_query_limits — a run through this
    path never has "unlimited" rows or no timeout at all.
  - delegate the actual query to the EXISTING plumbing
    (db_source_loader.load_spec, which already dispatches sqlite vs
    SQLAlchemy and already sanitizes its own connection-string errors) —
    no new driver code lives here.
  - measure elapsed_ms around that call.
  - truncate rows to the resolved max_rows; record a warning when
    truncation actually happened.
  - sanitize any exception before it escapes (defense in depth —
    load_spec already sanitizes its own; this is a second layer in case a
    future caller/plumbing change raises something unsanitized).
  - return a SqlExecutionResult — never a bare list of rows.

Does NOT:
  - parse {?Parametro} placeholders — sql_parameter_parser's job; this
    accepts ALREADY-prepared SQL with :name bind markers, e.g. its own
    prepared_sql/bind_order output.
  - know about datasource aliases or the registry —
    db_source_registry.query_registered is the alias-resolving entry
    point the existing HTTP route already uses; this executor takes a
    resolved connection spec dict directly (the shape db_source_loader.
    load_spec already accepts: {type, url|path, ...}), for the
    report-command execution path a later phase wires up.
  - inspect schema as a separate feature (a later phase).
  - touch HTTP, UI, Field Explorer, or the document serializer.

Timeout note: resolve_timeout() always returns a bounded value and this
value IS threaded through to load_spec, but full driver-level socket
timeout enforcement for every code path (arbitrary SQLAlchemy dialects)
remains a known follow-up — already flagged this way in Security Patch 0
(db_source_pymssql.py's own login_timeout/timeout is the one path that
already enforces one independently).
"""


def execute_command(
    connection_spec: dict[str, Any],
    prepared_sql: str,
    parameters: dict[str, Any] | None = None,
    max_rows: int | None = None,
    timeout: float | None = None,
) -> SqlExecutionResult:
    verdict = guard_check(prepared_sql)
    if not verdict["allowed"]:
        raise DbSourceError(f"SQL command rejected ({verdict['kind']}): {verdict['reason']}")

    resolved_max_rows = resolve_max_rows(max_rows)
    resolved_timeout = resolve_timeout(timeout)

    run_spec = dict(connection_spec)
    run_spec["query"] = prepared_sql
    run_spec["params"] = dict(parameters or {})
    run_spec["timeout"] = resolved_timeout
    dataset_key = run_spec.get("dataset", "items")

    start = time.perf_counter()
    try:
        result = load_spec(run_spec)
    except Exception as e:
        raise DbSourceError(sanitize_exception(e)) from e
    elapsed_ms = (time.perf_counter() - start) * 1000

    rows = result.get(dataset_key, [])
    truncated = truncate_rows(rows, resolved_max_rows)
    columns = list(truncated[0].keys()) if truncated else []
    warnings: list[str] = []
    if len(rows) > len(truncated):
        warnings.append(f"Result truncated to {resolved_max_rows} rows (query returned {len(rows)}).")

    return SqlExecutionResult(
        rows=truncated,
        columns=columns,
        elapsed_ms=elapsed_ms,
        row_count=len(truncated),
        warnings=warnings,
    )
