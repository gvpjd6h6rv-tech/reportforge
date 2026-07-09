from __future__ import annotations

from .api_contracts import HTTPException

"""
api_routes_sql_command_execution — HTTP entry point for REAL execution of
a saved SQL Command against a registered structured-MSSQL datasource
(F19B-1A). Nothing else.

R5 (F19A/F19B-0R): AVOIDED, not fixed, for this path. This route calls
sql_executor.execute_command() EXCLUSIVELY — it never imports or calls
db_source_registry.query_registered. Evidence for why query_registered
itself was left untouched: it has at least two independent, already-
shipped callers today — reportforge/server/api_routes_datasources.py's
POST /datasources/{alias}/query (FastAPI) AND the legacy plain-http
handler reportforge_server_datasources.py:_post_ds_query — both calling
query_registered(alias, ...) directly. Changing query_registered's
internals (e.g. to delegate to execute_command) risks changing behavior
for both of those existing, unrelated consumers. query_registered
therefore remains legacy / untouched; it is NOT used by SQL Command
execution, now or via this route.

Responsibility: orchestrate ONLY.
  - POST /sql-commands/execute: resolve+validate a registered alias, a
    SqlCommandModel, and its bind values (reusing sql_command_schema_
    request.resolve_bind_values — the SAME fail-closed contract already
    used by /sql-commands/schema); require explicit confirmation in the
    payload; require the resolved datasource to be structured-MSSQL
    (db_source_spec_adapter.is_structured_mssql_spec) — a url-shaped or
    sqlite datasource is rejected here, not executed, while F19A Risk R3
    remains BLOCKED_TIMEOUT_ENFORCEMENT for the SQLAlchemy/url path (see
    F19B-0R's Finding Closure Table, FC5); classify the statement via
    sql_safety_guard.check() BEFORE ever calling execute_command, so a
    guard-rejected statement never reaches load_spec/pymssql.connect at
    all (execute_command's OWN internal guard_check remains the sole
    AUTHORITY for the actual execution decision — this route's own
    pre-check is for audit-log labeling/short-circuiting only, and can
    never be more permissive than execute_command's, since both call the
    exact same pure, stateless sql_safety_guard.check() function against
    the exact same prepared SQL); delegate the real run to
    sql_executor.execute_command (never re-implements limits/sanitization
    here); record EXACTLY ONE audit log entry per request, on every
    reachable outcome (blocked/error/timeout/empty/success — no return
    path skips it), via sql_execution_audit_log.record().
  - Stored procedures stay out (F19A/F19B-0 decision): a SqlCommandModel
    with command_type == "stored_procedure" is rejected explicitly, as a
    readable POLICY gate — independent of (and in addition to) the fact
    that sql_safety_guard's EXEC allowlist is empty in this phase and
    would already reject the underlying SQL text too.

Does NOT:
  - import or call db_source_registry.query_registered (see R5 note
    above) — enforced by test_api_routes_sql_command_execution_r5_avoided.py.
  - execute against a url-shaped or sqlite datasource.
  - execute a stored procedure, or trust the EXEC allowlist alone as the
    only stored-procedure gate.
  - persist anything (no document/serializer involvement).
  - touch Field Explorer, the SQL Commands list panel, or any UI.
  - ever store or return a password, connection string, or the SQL text
    itself in the audit trail (sql_execution_audit_log's own contract).
"""


def register_sql_command_execution_routes(app):
    @app.post(
        "/sql-commands/execute",
        tags=["SQL Commands"],
        summary=(
            "Execute a saved SQL Command against a registered structured-MSSQL "
            "datasource — guard-checked, confirmation-required, audited on every outcome"
        ),
    )
    async def _post_sql_command_execute(body: dict):
        import time

        from reportforge.core.render.datasource.db_source import get_registered
        from reportforge.core.render.datasource.db_source_errors import DbSourceError
        from reportforge.core.render.datasource.db_source_spec_adapter import is_structured_mssql_spec
        from reportforge.core.render.datasource.sql_command_model import SqlCommandModel
        from reportforge.core.render.datasource.sql_command_schema_request import resolve_bind_values
        from reportforge.core.render.datasource.sql_execution_audit_log import record as audit_record
        from reportforge.core.render.datasource.sql_execution_audit_log import sql_fingerprint
        from reportforge.core.render.datasource.sql_executor import execute_command
        from reportforge.core.render.datasource.sql_query_limits import resolve_max_rows, resolve_timeout
        from reportforge.core.render.datasource.sql_safety_guard import check as guard_check

        alias = body.get("alias") or body.get("datasource_alias") or ""
        confirm = body.get("confirm") is True
        raw_command = body.get("sql_command")
        command_id = raw_command.get("id") or raw_command.get("name") if isinstance(raw_command, dict) else None

        def _blocked(reason: str, statement_kind: str = "UNKNOWN") -> dict:
            audit_record(
                datasource_alias=alias or None, command_id=command_id, statement_kind=statement_kind,
                status="blocked", confirmation_present=confirm,
            )
            return {"status": "blocked", "reason": reason}

        if not alias:
            return _blocked("'alias' (datasource_alias) is required")

        spec = get_registered(alias)
        if not spec:
            return _blocked("datasource not found")

        if not confirm:
            return _blocked("explicit confirmation ('confirm': true) is required to execute a SQL command")

        if not is_structured_mssql_spec(spec):
            return _blocked("only structured MSSQL datasources are supported for execution")

        if not isinstance(raw_command, dict):
            return _blocked("'sql_command' is required")

        try:
            sql_command = SqlCommandModel.from_dict(raw_command)
        except (ValueError, KeyError) as e:
            return _blocked(f"invalid sql_command: {e}")

        if sql_command.command_type == "stored_procedure":
            return _blocked("stored procedure execution is not supported in this phase", statement_kind="EXEC")

        try:
            bind_values = resolve_bind_values(sql_command, body.get("parameter_values"))
        except ValueError as e:
            return _blocked(str(e))

        fp = sql_fingerprint(sql_command.sql)
        max_rows_effective = resolve_max_rows(sql_command.max_rows_preview)
        timeout_effective = resolve_timeout(body.get("timeout"))

        # Pre-check for audit labeling / short-circuiting only —
        # execute_command() re-runs this exact, pure, stateless check as
        # the sole AUTHORITY before touching any connection. See module
        # docstring: this can never be more permissive than that call.
        guard_verdict = guard_check(sql_command.sql)
        statement_kind = guard_verdict["kind"]

        if not guard_verdict["allowed"]:
            audit_record(
                datasource_alias=alias, command_id=command_id, statement_kind=statement_kind,
                status="blocked", confirmation_present=True,
                max_rows_effective=max_rows_effective, timeout_effective=timeout_effective,
                sql_fingerprint_value=fp,
            )
            return {"status": "blocked", "reason": guard_verdict["reason"]}

        start = time.perf_counter()
        try:
            result = execute_command(
                spec, sql_command.sql, parameters=bind_values,
                max_rows=max_rows_effective, timeout=timeout_effective,
            )
        except DbSourceError as e:
            duration_ms = (time.perf_counter() - start) * 1000
            safe_error = str(e)
            status = "timeout" if "timeout" in safe_error.lower() else "error"
            audit_record(
                datasource_alias=alias, command_id=command_id, statement_kind=statement_kind,
                status=status, confirmation_present=True,
                max_rows_effective=max_rows_effective, timeout_effective=timeout_effective,
                duration_ms=duration_ms, safe_error=safe_error, sql_fingerprint_value=fp,
            )
            return {"status": status, "safe_error": safe_error}

        duration_ms = (time.perf_counter() - start) * 1000
        status = "empty" if result.row_count == 0 else "success"
        audit_record(
            datasource_alias=alias, command_id=command_id, statement_kind=statement_kind,
            status=status, confirmation_present=True,
            max_rows_effective=max_rows_effective, timeout_effective=timeout_effective,
            duration_ms=duration_ms, row_count=result.row_count, sql_fingerprint_value=fp,
        )
        return {
            "status": status,
            "columns": result.columns,
            "rows": result.rows,
            "row_count": result.row_count,
            "warnings": result.warnings,
        }
