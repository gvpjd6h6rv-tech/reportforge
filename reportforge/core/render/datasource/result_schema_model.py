from __future__ import annotations

from dataclasses import dataclass
from typing import Any

"""
result_schema_model — represents a single column of a SQL command/stored
procedure resultset. Nothing else.

Responsibility: hold the data shape and its dict roundtrip. Does NOT:
  - inspect a database (sql_schema_inspector's job)
  - execute SQL
  - feed the Field Explorer directly (DataSourceFieldExplorerAdapter's job)

A command's result_schema is a plain list of these, each dict-shaped via
to_dict()/from_dict() the same way sql_command_model.py stores it.
"""


@dataclass
class ResultColumnModel:
    name: str
    db_type: str
    rf_type: str
    nullable: bool = True
    ordinal: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "db_type": self.db_type,
            "rf_type": self.rf_type,
            "nullable": self.nullable,
            "ordinal": self.ordinal,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ResultColumnModel":
        return cls(
            name=data["name"],
            db_type=data["db_type"],
            rf_type=data["rf_type"],
            nullable=bool(data.get("nullable", True)),
            ordinal=data.get("ordinal", 0),
        )
