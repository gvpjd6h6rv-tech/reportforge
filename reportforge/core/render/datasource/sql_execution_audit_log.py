from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Any

from .sql_error_sanitizer import sanitize

"""
sql_execution_audit_log — records ONE structured entry per SQL Command
execution ATTEMPT (success, empty, blocked, error, or timeout — every
reachable outcome, no silent path skips this). Nothing else.

CONTEXT (F19A Risk R6, F19B-0R disposition PROMOTED_TO_NEXT_REQUIRED_PHASE):
no execution-accessible surface (endpoint or UI) may exist without this.
This module is the ONLY writer of that trail — api_routes_sql_command_
execution.py calls record() exactly once per request, from a single
return path, so no outcome (including a rejected/blocked one) can bypass
it silently.

Responsibility:
  - hold a minimal, typed set of fields (see _REQUIRED_FIELDS) — no more,
    no less than what F19B-1A's brief specifies as the minimum schema.
  - compute a SQL fingerprint (sha256, truncated) instead of ever storing
    the SQL text itself — enough to correlate/deduplicate log entries
    without ever persisting a statement that might carry a sensitive
    literal.
  - sanitize() any error text a SECOND time before storing it (defense in
    depth — mirrors sql_executor.py's own documented pattern: "sanitize
    any exception before it escapes ... in case a future caller/plumbing
    change raises something unsanitized"). Callers are expected to pass
    an already-sanitized safe_error (execute_command's DbSourceError
    messages already are), but this module never trusts that alone.
  - default user_context to the literal string "unknown" when the caller
    doesn't have one — never fabricated, never silently blank.
  - emit one INFO-level structured log line via the stdlib logging
    module (searchable in server logs) AND keep an in-memory list for
    tests/observability — mirrors the existing in-memory-registry
    pattern already used by db_source_registry._REGISTRY and
    sql_procedure_allowlist._ALLOWLIST in this same package.

Does NOT:
  - execute SQL, open a connection, or decide whether a statement is safe
    (sql_safety_guard/sql_executor's job — this module only records what
    already happened).
  - ever accept or store: password, connection string, username, full SQL
    text, or raw/unsanitized parameter values. There is no parameter in
    record()'s signature for any of these — a caller cannot pass what
    this module has no field for.
  - persist to disk. An in-memory list plus a logging.Logger call is the
    whole storage story for this phase — durable/external log shipping is
    a later, separate concern, not part of F19B-1A's backend-foundation
    scope.
"""

_log = logging.getLogger("reportforge.sql_execution_audit")

_VALID_STATUSES = {"success", "empty", "blocked", "error", "timeout"}

_LOG: list[dict[str, Any]] = []
_MAX_IN_MEMORY_ENTRIES = 1000


def sql_fingerprint(prepared_sql: str | None) -> str:
    """Stable, content-derived identifier for a prepared SQL string —
    never the SQL itself. Two identical statements always produce the
    same fingerprint; the fingerprint alone cannot be reversed back into
    the original text."""
    text = prepared_sql or ""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def record(
    *,
    datasource_alias: str | None,
    command_id: str | None,
    statement_kind: str,
    status: str,
    confirmation_present: bool,
    max_rows_effective: int | None = None,
    timeout_effective: float | None = None,
    duration_ms: float | None = None,
    row_count: int | None = None,
    safe_error: str | None = None,
    sql_fingerprint_value: str | None = None,
    user_context: str | None = None,
) -> dict[str, Any]:
    if status not in _VALID_STATUSES:
        raise ValueError(f"Invalid audit status: {status!r} — must be one of {sorted(_VALID_STATUSES)}")

    entry: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "datasource_alias": datasource_alias,
        "command_id": command_id,
        "operation_type": "sql_command",
        "statement_kind": statement_kind,
        "max_rows_effective": max_rows_effective,
        "timeout_effective": timeout_effective,
        "status": status,
        "duration_ms": duration_ms,
        "row_count": row_count,
        # Defense in depth, second sanitizer pass — see module docstring.
        "safe_error": sanitize(safe_error) if safe_error else None,
        "confirmation_present": bool(confirmation_present),
        "sql_fingerprint": sql_fingerprint_value,
        # Never fabricated: explicit "unknown" when no context was supplied,
        # never silently omitted or guessed at.
        "user_context": user_context or "unknown",
    }

    _LOG.append(entry)
    if len(_LOG) > _MAX_IN_MEMORY_ENTRIES:
        del _LOG[: len(_LOG) - _MAX_IN_MEMORY_ENTRIES]

    _log.info("sql_command_execution status=%s alias=%s kind=%s", status, datasource_alias, statement_kind, extra=entry)

    return entry


def recent(n: int = 50) -> list[dict[str, Any]]:
    return list(_LOG[-n:])


def clear() -> None:
    """Test-only reset — mirrors sql_procedure_allowlist.clear_allowlist()."""
    _LOG.clear()
