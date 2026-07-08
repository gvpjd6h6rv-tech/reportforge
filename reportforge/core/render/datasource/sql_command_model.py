from __future__ import annotations

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
"""


@dataclass
class SqlCommandModel:
    id: str
    name: str
    sql: str
    command_type: str = "query"  # "query" | "stored_procedure"
    parameters: list[dict] = field(default_factory=list)
    result_schema: list[dict] = field(default_factory=list)
    max_rows_preview: int = 100

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "sql": self.sql,
            "command_type": self.command_type,
            "parameters": list(self.parameters),
            "result_schema": list(self.result_schema),
            "max_rows_preview": self.max_rows_preview,
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
        )
