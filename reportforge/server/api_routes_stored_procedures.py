from __future__ import annotations

import logging
import time
from pathlib import Path

"""
api_routes_stored_procedures — HTTP entry point for F19C controlled
Stored Procedure execution. Nothing else.

Responsibility: orchestrate ONLY.
  - GET /stored-procedures: list ENABLED procedures for the UI picker —
    id/label/params schema only (stored_procedure_registry.list_enabled()
    already never includes datasourceId or the real procedure name).
  - POST /stored-procedures/execute: body is EXACTLY {storedProcedureId,
    params} — no procedure name, no SQL, no datasource alias accepted
    from the client. Delegates the whole decision (allowlist lookup,
    identifier + param validation, datasource resolution, parameterized
    EXEC) to stored_procedure_executor.execute_stored_procedure(); records
    EXACTLY ONE stored_procedure_audit_log entry per request, on every
    reachable outcome (blocked/error/timeout/empty/success — no return
    path skips it); returns body.status, never relies on HTTP status
    alone (mirrors /sql-commands/execute's own contract).

Does NOT:
  - accept a raw procedure name, SQL text, or datasource alias from the
    request body.
  - execute anything itself — always via stored_procedure_executor.
  - touch Field Explorer, Preview, or the plain SQL Command UI/endpoints.
  - persist anything beyond the audit log entry.
"""

_log = logging.getLogger("reportforge.api_routes_stored_procedures")

_CONFIG_PATH = Path(__file__).resolve().parent / "stored_procedures_config.json"


def _load_config_defensively() -> None:
    from reportforge.core.render.datasource.stored_procedure_registry import load_config

    try:
        load_config(_CONFIG_PATH)
    except (OSError, ValueError) as e:
        _log.warning("stored_procedures_config.json could not be loaded (%s) — allowlist starts empty", e)


def register_stored_procedure_routes(app):
    _load_config_defensively()

    @app.get(
        "/stored-procedures",
        tags=["Stored Procedures"],
        summary="List enabled Stored Procedures available for controlled execution — id/label/params only, never a real procedure name or datasource",
    )
    async def _get_stored_procedures():
        from reportforge.core.render.datasource.stored_procedure_registry import list_enabled

        return {"storedProcedures": list_enabled()}

    @app.post(
        "/stored-procedures/execute",
        tags=["Stored Procedures"],
        summary="Execute an allowlisted Stored Procedure by ID with validated params — never accepts a raw procedure name or SQL text",
    )
    async def _post_stored_procedures_execute(body: dict):
        from reportforge.core.render.datasource.db_source_errors import DbSourceError
        from reportforge.core.render.datasource.stored_procedure_audit_log import record as audit_record
        from reportforge.core.render.datasource.stored_procedure_executor import (
            StoredProcedureBlockedError,
            execute_stored_procedure,
        )
        from reportforge.core.render.datasource.stored_procedure_registry import get_definition

        proc_id = body.get("storedProcedureId")
        raw_params = body.get("params")
        param_names = sorted(raw_params.keys()) if isinstance(raw_params, dict) else []
        predefinition = get_definition(proc_id) if isinstance(proc_id, str) else None

        def _blocked(reason: str) -> dict:
            audit_record(
                procedure_logical_id=proc_id if isinstance(proc_id, str) else None,
                procedure_sql_name=predefinition.get("procedure") if predefinition else None,
                datasource_id=predefinition.get("datasourceId") if predefinition else None,
                status="blocked", param_names=param_names, blocked_reason=reason,
            )
            return {"status": "blocked", "reason": reason}

        if not isinstance(proc_id, str) or not proc_id:
            return _blocked("'storedProcedureId' is required")

        start = time.perf_counter()
        try:
            definition, result = execute_stored_procedure(proc_id, raw_params)
        except StoredProcedureBlockedError as e:
            return _blocked(str(e))
        except DbSourceError as e:
            duration_ms = (time.perf_counter() - start) * 1000
            safe_error = str(e)
            status = "timeout" if "timeout" in safe_error.lower() else "error"
            audit_record(
                procedure_logical_id=proc_id, procedure_sql_name=predefinition.get("procedure") if predefinition else None,
                datasource_id=predefinition.get("datasourceId") if predefinition else None,
                status=status, param_names=param_names, duration_ms=duration_ms, safe_error=safe_error,
            )
            return {"status": status, "safe_error": safe_error}

        from reportforge.core.render.datasource.sql_query_limits import resolve_max_rows, resolve_timeout

        duration_ms = (time.perf_counter() - start) * 1000
        status = "empty" if result.row_count == 0 else "success"
        max_rows_effective = resolve_max_rows(definition.get("maxRows"))
        timeout_effective = resolve_timeout(definition.get("timeoutSeconds"))
        audit_record(
            procedure_logical_id=proc_id, procedure_sql_name=definition["procedure"], datasource_id=definition["datasourceId"],
            status=status, param_names=param_names, row_count=result.row_count,
            duration_ms=duration_ms, max_rows_effective=max_rows_effective, timeout_effective=timeout_effective,
        )
        return {
            "status": status,
            "columns": result.columns,
            "rows": result.rows,
            "row_count": result.row_count,
            "warnings": result.warnings,
            "max_rows_effective": max_rows_effective,
            "timeout_effective": timeout_effective,
        }
