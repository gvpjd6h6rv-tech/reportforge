from __future__ import annotations

import re
from typing import Any

from .sql_command_model import SqlCommandModel
from .sql_executor import execute_command
from .sql_parameter_model import SqlParameterModel

"""
stored_procedure_catalog — lists stored procedures available on a
connection, reads their parameters when the engine allows it, and builds
a SqlCommandModel(command_type="stored_procedure") the caller can later
choose to save/allowlist/execute. Nothing else.

Responsibility:
  - list_procedures(connection_spec): query the engine's own system
    catalog (sys.procedures for MSSQL) via sql_executor.execute_command —
    a plain, read-only SELECT the safety guard already allows. SQLite has
    no stored procedures at all and honestly returns an empty list, not a
    simulated one. Any OTHER/unsupported engine type also returns an
    empty list, with an explicit warning — never a crash.
  - read_procedure_parameters(connection_spec, procedure_name): query
    sys.parameters joined to sys.procedures, filtered by procedure name
    passed as a BIND PARAMETER (never interpolated into the SQL string).
    Returns SqlParameterModel entries with source="procedure_param".
  - build_stored_procedure_command(procedure_name, parameters): construct
    a SqlCommandModel whose .sql is an "EXEC name :p1, :p2" template —
    never executed here, just built. The procedure_name (and, if
    schema-qualified, the schema part) is validated against a strict
    identifier pattern FIRST — this is where a malicious/malformed name
    reaching this point (semicolons, comments, brackets, quotes, multiple
    qualifiers, xp_/sp_ prefixes, or any non [A-Za-z0-9_] character) is
    rejected, since this string ends up embedded directly into the
    command's .sql template (bind params only cover VALUES, not the
    procedure name itself in EXEC syntax).

Does NOT:
  - execute a real EXEC of any procedure (only sql_executor.execute_command
    is ever called, always with a read-only catalog SELECT)
  - auto-allowlist anything — sql_procedure_allowlist.add_to_allowlist is
    never called from this module; listing/reading is not authorizing,
    that remains a separate, later, explicit UI-driven decision
  - infer a result schema (sql_schema_inspector's job, a separate module)
  - execute SQL outside of sql_executor.execute_command
  - touch HTTP, UI, Field Explorer, Preview, or the document serializer
"""

_VALID_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_DANGEROUS_PREFIXES = ("XP_", "SP_")

_MSSQL_LIST_PROCEDURES_SQL = "SELECT name FROM sys.procedures ORDER BY name"
_MSSQL_LIST_PARAMETERS_SQL = (
    "SELECT p.name AS param_name, TYPE_NAME(p.user_type_id) AS param_type "
    "FROM sys.parameters p JOIN sys.procedures pr ON pr.object_id = p.object_id "
    "WHERE pr.name = :procedure_name ORDER BY p.parameter_id"
)

_SQL_TYPE_TO_RF_TYPE = {
    "date": "date", "datetime": "date", "datetime2": "date", "smalldatetime": "date",
    "int": "number", "bigint": "number", "smallint": "number", "tinyint": "number",
    "decimal": "number", "numeric": "number", "float": "number", "real": "number", "money": "number",
    "bit": "boolean",
    "varchar": "string", "nvarchar": "string", "char": "string", "nchar": "string", "text": "string",
}


def _validate_identifier_part(part: str) -> None:
    if not _VALID_IDENTIFIER.match(part):
        raise ValueError(f"Invalid identifier: {part!r}")
    if part.upper().startswith(_DANGEROUS_PREFIXES):
        raise ValueError(f"System-prefixed identifier not allowed: {part!r}")


def validate_procedure_identifier(name: str) -> None:
    if not name or not isinstance(name, str):
        raise ValueError("Procedure identifier must be a non-empty string")
    parts = name.split(".")
    if len(parts) > 2:
        raise ValueError(f"Invalid identifier (too many qualifiers): {name!r}")
    for part in parts:
        _validate_identifier_part(part)


def _sql_type_to_rf_type(sql_type: str) -> str:
    return _SQL_TYPE_TO_RF_TYPE.get((sql_type or "").lower(), "string")


def list_procedures(connection_spec: dict[str, Any]) -> tuple[list[str], list[str]]:
    engine_type = connection_spec.get("type", "")
    if engine_type == "sqlite":
        return [], []
    if engine_type != "mssql":
        return [], [f"Unsupported engine for stored procedure catalog: {engine_type!r} — returning empty list."]

    result = execute_command(connection_spec, _MSSQL_LIST_PROCEDURES_SQL, max_rows=1000)
    names = [row["name"] for row in result.rows]
    return names, list(result.warnings)


def read_procedure_parameters(
    connection_spec: dict[str, Any],
    procedure_name: str,
) -> tuple[list[SqlParameterModel], list[str]]:
    validate_procedure_identifier(procedure_name)

    engine_type = connection_spec.get("type", "")
    if engine_type == "sqlite":
        return [], []
    if engine_type != "mssql":
        return [], [f"Unsupported engine for stored procedure catalog: {engine_type!r} — returning empty list."]

    result = execute_command(
        connection_spec,
        _MSSQL_LIST_PARAMETERS_SQL,
        {"procedure_name": procedure_name},
        max_rows=100,
    )
    parameters = [
        SqlParameterModel(
            name=row["param_name"],
            type=_sql_type_to_rf_type(row.get("param_type", "")),
            source="procedure_param",
        )
        for row in result.rows
    ]
    return parameters, list(result.warnings)


def build_stored_procedure_command(
    procedure_name: str,
    parameters: list[SqlParameterModel] | None = None,
) -> SqlCommandModel:
    validate_procedure_identifier(procedure_name)
    parameters = parameters or []

    placeholders = ", ".join(f":{p.name}" for p in parameters)
    sql = f"EXEC {procedure_name}" + (f" {placeholders}" if placeholders else "")

    return SqlCommandModel(
        id=procedure_name,
        name=procedure_name,
        sql=sql,
        command_type="stored_procedure",
        parameters=[p.to_dict() for p in parameters],
    )
