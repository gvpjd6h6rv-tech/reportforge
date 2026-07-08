from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .result_schema_model import ResultColumnModel
from .sql_executor import execute_command

"""
sql_schema_inspector — derives a result schema (list[ResultColumnModel])
for an already-prepared SQL command, by running it through sql_executor
with a small, safe max_rows and inferring column types from the actual
returned values. Nothing else.

LIMITATION (explicit, not a hidden gap): this inspector does NOT obtain
real driver metadata. It does not use cursor.description or any DBAPI-
level type information — db_source_queries.py (the actual driver call
site) doesn't expose that today, and extending it to do so was
explicitly out of scope for this phase ("no reescribir todo datasource").
Every db_type/rf_type here is INFERRED from the Python runtime type of
the first non-null value seen in each column, across the small sample of
rows actually returned. If a column has no rows at all, or every value
in it is NULL, its type is reported as the conservative fallback
"unknown"/"string" WITH AN EXPLICIT WARNING — never silently guessed.
This module must never claim "driver schema verified" anywhere in its
output; it only ever reports a value-based inference.

Responsibility:
  - execute an already-prepared command via sql_executor.execute_command
    (never SQL directly, never touches db_source_queries or
    db_source_introspection).
  - use a low, safe max_rows for the inspection preview — a schema probe
    doesn't need the full result set.
  - convert the returned rows into list[ResultColumnModel].
  - infer db_type/rf_type from runtime values when present.
  - report honest warnings when there isn't enough data to infer a type.

Does NOT:
  - execute SQL directly (delegates 100% to sql_executor)
  - import db_source_queries or db_source_introspection
  - import sql_safety_guard directly (reused indirectly, via
    sql_executor's own guard call)
  - parse {?Parametro} placeholders
  - list stored procedures (Fase 7's job)
  - render anything, touch UI, Field Explorer, preview, or the document
    serializer
"""

DEFAULT_SCHEMA_PREVIEW_MAX_ROWS = 5

_PY_TYPE_TO_RF_TYPE = {
    bool: "boolean",
    int: "number",
    float: "number",
    str: "string",
}


@dataclass
class SchemaInspectionResult:
    columns: list[ResultColumnModel] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def inspect_schema(
    connection_spec: dict[str, Any],
    prepared_sql: str,
    parameters: dict[str, Any] | None = None,
    max_rows: int | None = None,
) -> SchemaInspectionResult:
    preview_max_rows = max_rows if max_rows is not None else DEFAULT_SCHEMA_PREVIEW_MAX_ROWS
    execution = execute_command(
        connection_spec,
        prepared_sql,
        parameters=parameters,
        max_rows=preview_max_rows,
    )

    warnings: list[str] = list(execution.warnings)
    columns: list[ResultColumnModel] = []

    if not execution.rows:
        for ordinal, name in enumerate(execution.columns):
            columns.append(ResultColumnModel(name=name, db_type="unknown", rf_type="string", nullable=True, ordinal=ordinal))
        warnings.append(
            "No rows returned — column types could not be inferred from values; reported as unknown/string (not driver-verified)."
        )
        return SchemaInspectionResult(columns=columns, warnings=warnings)

    for ordinal, name in enumerate(execution.columns):
        values = [row.get(name) for row in execution.rows]
        non_null = [v for v in values if v is not None]
        has_null = any(v is None for v in values)
        if not non_null:
            columns.append(ResultColumnModel(name=name, db_type="unknown", rf_type="string", nullable=True, ordinal=ordinal))
            warnings.append(
                f"Column {name!r}: all sampled values are NULL — type reported as unknown/string (not driver-verified)."
            )
            continue
        py_type = type(non_null[0])
        rf_type = _PY_TYPE_TO_RF_TYPE.get(py_type, "string")
        db_type = py_type.__name__
        columns.append(ResultColumnModel(name=name, db_type=db_type, rf_type=rf_type, nullable=has_null, ordinal=ordinal))

    return SchemaInspectionResult(columns=columns, warnings=warnings)
