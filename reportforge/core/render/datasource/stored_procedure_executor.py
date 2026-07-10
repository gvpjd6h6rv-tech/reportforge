from __future__ import annotations

import re
from typing import Any

from . import db_source_registry
from .db_source_spec_adapter import is_structured_mssql_spec
from .sql_execution_result import SqlExecutionResult
from .sql_executor import execute_command
from .stored_procedure_catalog import validate_procedure_identifier
from .stored_procedure_param_validator import StoredProcedureParamError, validate_params
from .stored_procedure_registry import get_definition

"""
stored_procedure_executor — F19C. Orchestrates ONE controlled Stored
Procedure call end-to-end: allowlist lookup by ID, identifier + param
validation, parameterized EXEC, delegated to the existing sql_executor.
Nothing else.

Responsibility:
  - execute_stored_procedure(proc_id, raw_params): the ONLY entry point.
    1. look up proc_id in stored_procedure_registry — unknown or disabled
       raises StoredProcedureBlockedError (never a raw procedure name is
       accepted here or anywhere downstream — the caller/route passes
       only an ID).
    2. re-validate the definition's OWN procedure identifier via
       stored_procedure_catalog.validate_procedure_identifier — defense
       in depth against a malformed/dangerous name ever having been
       registered (the registry itself only checks shape, not the
       identifier's safety).
    3. validate raw_params against the definition's params schema via
       stored_procedure_param_validator — extra/missing/wrong-type/
       maxLength all raise StoredProcedureBlockedError.
    4. resolve the definition's OWN datasourceId via db_source_registry —
       must be a registered, structured-MSSQL spec, exactly like the
       existing SQL Command execution path; otherwise blocked.
    5. build "EXEC schema.name @Param=:bind" text — the procedure name
       comes ONLY from the validated definition, param VALUES are always
       passed as bind parameters to sql_executor.execute_command, never
       string-concatenated.
    6. delegate to sql_executor.execute_command — reuses its existing
       guard check, timeout/max_rows resolution, error sanitization; the
       definition's OWN timeoutSeconds/maxRows are passed through as the
       requested values (sql_executor still clamps them to its own
       global bounds).

Does NOT:
  - accept a procedure name, SQL text, or raw identifier from the caller
    — only proc_id (a key into the allowlist) and a params dict.
  - write to the audit log (the HTTP route's job, exactly one call per
    request, same as api_routes_sql_command_execution.py's existing
    pattern).
  - touch HTTP or UI.
"""

_BIND_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class StoredProcedureBlockedError(ValueError):
    """Raised for any reason execution must be refused before (or instead
    of) touching sql_executor — safe-to-show .args[0] reason."""


def _build_exec_sql(procedure: str, param_names: list[str]) -> str:
    for name in param_names:
        if not _BIND_NAME.match(name):
            raise StoredProcedureBlockedError(f"Invalid parameter name: {name!r}")
    placeholders = ", ".join(f"@{name}=:{name}" for name in param_names)
    return f"EXEC {procedure}" + (f" {placeholders}" if placeholders else "")


def execute_stored_procedure(
    proc_id: str,
    raw_params: dict[str, Any] | None,
) -> tuple[dict[str, Any], SqlExecutionResult]:
    definition = get_definition(proc_id)
    if definition is None:
        raise StoredProcedureBlockedError(f"Unknown storedProcedureId: {proc_id!r}")
    if not definition.get("enabled", False):
        raise StoredProcedureBlockedError(f"storedProcedureId is disabled: {proc_id!r}")

    try:
        validate_procedure_identifier(definition["procedure"])
    except ValueError as e:
        raise StoredProcedureBlockedError(f"Registered procedure identifier is invalid: {e}") from e

    try:
        validated_params = validate_params(definition, raw_params)
    except StoredProcedureParamError as e:
        raise StoredProcedureBlockedError(str(e)) from e

    spec = db_source_registry.get_registered(definition["datasourceId"])
    if not spec or not is_structured_mssql_spec(spec):
        raise StoredProcedureBlockedError(
            f"datasourceId {definition['datasourceId']!r} is not a registered structured-MSSQL datasource"
        )

    sql = _build_exec_sql(definition["procedure"], list(validated_params.keys()))
    result = execute_command(
        spec, sql, parameters=validated_params,
        max_rows=definition.get("maxRows"), timeout=definition.get("timeoutSeconds"),
    )
    return definition, result
