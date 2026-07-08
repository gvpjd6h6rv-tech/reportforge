from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

"""
sql_command_model — represents a saved SQL command (Crystal-like "Command"
or stored procedure call). Nothing else.

Responsibility: hold the data shape and its dict roundtrip. Does NOT:
  - execute SQL
  - validate SQL safety (sql_safety_guard's job)
  - open any UI
  - touch the renderer or Field Explorer

CONTRACT (RF-SQL-COMMAND-MODEL-SQL-FORMAT-1, resolves GAP-3): `.sql` is
ALWAYS already-prepared, executable SQL with internal bind markers
(":Name" — the format sql_parameter_parser.parse_parameters() produces
and sql_executor.execute_command() consumes directly). Raw Crystal-style
"{?Param}" syntax does NOT live here — a caller with raw user-typed SQL
must run it through sql_parameter_parser.parse_parameters() FIRST and
store the resulting .prepared_sql, never the original. This is enforced,
not just documented: constructing a SqlCommandModel whose .sql still
contains a "{?Name}"-shaped token raises ValueError immediately. If a
later phase needs to preserve the user's original raw text (e.g. for
re-editing in a SQL Command Editor UI), that is a SEPARATE field/model
owned by that phase — not a second meaning overloaded onto this one.
stored_procedure_catalog.build_stored_procedure_command() already only
ever produces prepared (":Name") SQL, consistent with this contract.
"""

_RAW_CRYSTAL_PLACEHOLDER = re.compile(r"\{\?[A-Za-z_]")


@dataclass
class SqlCommandModel:
    id: str
    name: str
    sql: str
    command_type: str = "query"  # "query" | "stored_procedure"
    parameters: list[dict] = field(default_factory=list)
    result_schema: list[dict] = field(default_factory=list)
    max_rows_preview: int = 100
    # UDS 4.1 Fase 17A: which registered datasource this command belongs
    # to — optional, no fallback, no fabricated value. None means "not
    # known" (e.g. a command built before this field existed, or never
    # associated with one), never guessed at.
    datasource_alias: str | None = None

    def __post_init__(self) -> None:
        if _RAW_CRYSTAL_PLACEHOLDER.search(self.sql):
            raise ValueError(
                "SqlCommandModel.sql must be already-prepared SQL (bind markers "
                "like :Name), not raw Crystal-style {?Param} syntax — run it "
                f"through sql_parameter_parser.parse_parameters() first. Got: {self.sql!r}"
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "sql": self.sql,
            "command_type": self.command_type,
            "parameters": list(self.parameters),
            "result_schema": list(self.result_schema),
            "max_rows_preview": self.max_rows_preview,
            "datasource_alias": self.datasource_alias,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SqlCommandModel":
        return cls(
            id=data["id"],
            name=data["name"],
            sql=data["sql"],
            command_type=data.get("command_type", "query"),
            parameters=list(data.get("parameters") or []),
            result_schema=list(data.get("result_schema") or []),
            max_rows_preview=data.get("max_rows_preview", 100),
            datasource_alias=data.get("datasource_alias"),
        )
