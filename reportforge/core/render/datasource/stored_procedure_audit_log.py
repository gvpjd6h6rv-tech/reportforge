from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from .sql_error_sanitizer import sanitize

"""
stored_procedure_audit_log — records ONE structured entry per Stored
Procedure execution ATTEMPT (success, empty, blocked, error, or timeout).
Nothing else.

CONTEXT (F19C): sql_execution_audit_log's schema is scoped to F19B-1A's
generic "sql_command" brief and never stores SQL text or a real
identifier by design. Stored Procedure entries need different, SP-
specific fields the user explicitly asked to see (procedure LOGICAL id,
the real SQL procedure name, datasourceId, PARAM NAMES only) — a
separate module keeps each audit schema honest about what it actually
records, rather than overloading one schema with optional fields only
one caller ever fills in.

Responsibility:
  - hold a minimal, typed set of fields (see record()'s signature).
  - NEVER accept or store a parameter VALUE — only param NAMES (a list
    of strings), so a caller structurally cannot leak a secret/PII value
    into this log even by mistake (there is no field for it).
  - the SQL procedure name (e.g. "dbo.usp_DemoCustomerLookup") is safe to
    store here — it is an admin-configured allowlist identifier, not
    user-authored SQL text, and cannot itself carry a literal/secret.
  - sanitize() any error text a second time before storing (mirrors
    sql_execution_audit_log's own defense-in-depth pattern).
  - emit one INFO-level structured log line via stdlib logging AND keep
    an in-memory list for tests/observability (same pattern as
    sql_execution_audit_log / sql_procedure_allowlist / db_source_
    registry in this same package).

Does NOT:
  - execute SQL or decide whether a call is safe (stored_procedure_
    executor's job — this module only records what already happened).
  - ever accept: password, connection string, param VALUES, or raw SQL
    text. There is no field in record() for any of these.
  - persist to disk (durable/external log shipping is a later concern,
    same stance as sql_execution_audit_log).
"""

_log = logging.getLogger("reportforge.stored_procedure_audit")

_VALID_STATUSES = {"success", "empty", "blocked", "error", "timeout"}

_LOG: list[dict[str, Any]] = []
_MAX_IN_MEMORY_ENTRIES = 1000


def record(
    *,
    procedure_logical_id: str | None,
    procedure_sql_name: str | None,
    datasource_id: str | None,
    status: str,
    param_names: list[str] | None = None,
    row_count: int | None = None,
    max_rows_effective: int | None = None,
    timeout_effective: float | None = None,
    duration_ms: float | None = None,
    blocked_reason: str | None = None,
    safe_error: str | None = None,
    user_context: str | None = None,
) -> dict[str, Any]:
    if status not in _VALID_STATUSES:
        raise ValueError(f"Invalid audit status: {status!r} — must be one of {sorted(_VALID_STATUSES)}")

    entry: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "operation_type": "stored_procedure",
        "procedure_logical_id": procedure_logical_id,
        "procedure_sql_name": procedure_sql_name,
        "datasource_id": datasource_id,
        "status": status,
        "param_names": sorted(param_names) if param_names else [],
        "row_count": row_count,
        "max_rows_effective": max_rows_effective,
        "timeout_effective": timeout_effective,
        "duration_ms": duration_ms,
        "blocked_reason": sanitize(blocked_reason) if blocked_reason else None,
        "safe_error": sanitize(safe_error) if safe_error else None,
        "user_context": user_context or "unknown",
    }

    _LOG.append(entry)
    if len(_LOG) > _MAX_IN_MEMORY_ENTRIES:
        del _LOG[: len(_LOG) - _MAX_IN_MEMORY_ENTRIES]

    _log.info(
        "stored_procedure_execution status=%s procedure_logical_id=%s datasource_id=%s",
        status, procedure_logical_id, datasource_id, extra=entry,
    )

    return entry


def recent(n: int = 50) -> list[dict[str, Any]]:
    return list(_LOG[-n:])


def clear() -> None:
    """Test-only reset — mirrors sql_execution_audit_log.clear()."""
    _LOG.clear()
