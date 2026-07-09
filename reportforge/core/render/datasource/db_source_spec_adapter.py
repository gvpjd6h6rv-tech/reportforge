from __future__ import annotations

from typing import Any

"""
db_source_spec_adapter — normalizes a STRUCTURED datasource spec (the
{type, host, port, database, username, password} shape persisted by
connections_store.py and produced by POST /datasources/{alias}/connect)
into the exact shape db_source_pymssql.query()/connect() already expects.
Nothing else.

CONTEXT (F19A Claim C7, now fixed by this module + its wiring in
db_source_loader.py): db_source_loader.load_spec() historically required
a SQLAlchemy 'url' for every non-sqlite spec. A structured mssql spec
registered via POST /datasources/{alias}/connect has no 'url' key at
all — every guarded execution path (sql_executor.execute_command,
db_source_registry.query_registered, sql_schema_inspector.inspect_schema)
failed immediately with DbSourceError("db datasource requires 'url'"),
before ever reaching sql_safety_guard or opening a connection. This
module fixes the SHAPE mismatch. It does not change, weaken, or
duplicate the guard/limit logic those callers already apply.

Responsibility:
  - recognize a structured mssql spec (type == "mssql", no "url" key)
  - validate it fail-closed: host, database, username, password are all
    required; a spec missing any of them raises ValueError naming the
    missing FIELD NAME only — never a value, never the spec dict itself.
  - default port to 1433 (SQL Server's standard port) when absent.
  - pass an already-resolved "timeout" through unchanged when present
    (sql_executor.execute_command already resolves one via
    sql_query_limits.resolve_timeout() before calling load_spec — this
    module does not invent or resolve a timeout itself).
  - return a NEW dict (never mutates the input spec).

Does NOT:
  - execute any query
  - open any connection
  - do any I/O (no network, no disk, no logging)
  - build a connection-string/URL of any kind — the returned spec stays
    STRUCTURED (separate host/port/database/username/password fields),
    exactly what db_source_pymssql.query()/connect() already accept
    directly. This is deliberate: it means the plaintext password is
    NEVER concatenated into a single string that could be logged, cached,
    or displayed as one unit — the existing db_source_pymssql.py
    contract ("password... never logged, never returned in responses")
    keeps applying unchanged, instead of this module inventing a new,
    separate redaction scheme for a URL it doesn't need to build.
  - print() or log anything — a caller that wants to display an error is
    responsible for that; this module's own ValueError messages never
    contain a credential VALUE, only field names, so they are already
    safe to surface as-is.
  - persist anything to disk (connections_store.py already owns that,
    encrypted, unrelated to this module).
  - touch sqlite specs or specs that already carry a "url" — both are
    returned unchanged (shallow copy), so this module can never change
    behavior for any datasource shape it doesn't specifically recognize.
  - support any engine other than mssql (SAP B1 requirement, per scope).
    A structured spec with a "type" other than "mssql"/"sqlite" and no
    "url" is returned unchanged too — this module does not guess at an
    engine it wasn't explicitly asked to normalize; the existing
    "db datasource requires 'url'" error in db_source_loader.py still
    fires for that case, exactly as before this module existed.
"""

_REQUIRED_STRUCTURED_FIELDS: tuple[str, ...] = ("host", "database", "username", "password")
_DEFAULT_MSSQL_PORT = 1433


def is_structured_mssql_spec(spec: dict[str, Any]) -> bool:
    """True only for the shape this module normalizes: type == 'mssql'
    and no 'url' already present. Never true for sqlite or url-shaped
    specs — those are untouched by design."""
    if not isinstance(spec, dict):
        return False
    return (spec.get("type") or "").strip().lower() == "mssql" and not spec.get("url")


def to_executable_spec(spec: dict[str, Any]) -> dict[str, Any]:
    """
    Validate and normalize a structured mssql spec. Raises ValueError
    (field name only, never a value) if a required field is missing or
    empty. Returns a NEW dict shaped for db_source_pymssql.query()/
    connect(): {type, host, port, database, username, password[, timeout]}.
    """
    if not isinstance(spec, dict):
        raise ValueError("datasource spec must be a dict")

    if not is_structured_mssql_spec(spec):
        # Not this module's shape (already url-shaped, sqlite, or an
        # engine this module doesn't recognize) — never guessed at,
        # never mutated, never rejected. Callers that already gated on
        # is_structured_mssql_spec() before calling this (e.g.
        # db_source_loader.load_spec) hit this branch only defensively;
        # a caller that skips that gate still gets safe passthrough.
        return dict(spec)

    for field_name in _REQUIRED_STRUCTURED_FIELDS:
        if not spec.get(field_name):
            raise ValueError(
                f"Structured mssql datasource spec missing required field: {field_name!r}"
            )

    normalized: dict[str, Any] = {
        "type": "mssql",
        "host": spec["host"],
        "port": int(spec.get("port") or _DEFAULT_MSSQL_PORT),
        "database": spec["database"],
        "username": spec["username"],
        "password": spec["password"],
    }
    if "timeout" in spec and spec["timeout"] is not None:
        normalized["timeout"] = spec["timeout"]
    return normalized


def safe_display_target(spec: dict[str, Any]) -> str:
    """Credential-free label for logs/cache-keys/error messages, e.g.
    'mssql://host:1433/database'. Never includes username or password —
    callers building an error/log/cache-key string for a structured spec
    should use this instead of ever formatting the raw spec dict."""
    host = spec.get("host", "")
    port = spec.get("port", _DEFAULT_MSSQL_PORT)
    database = spec.get("database", "")
    return f"mssql://{host}:{port}/{database}"
