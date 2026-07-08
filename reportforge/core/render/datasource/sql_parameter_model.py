from __future__ import annotations

from dataclasses import dataclass
from typing import Any

"""
sql_parameter_model — represents a single SQL command parameter
({?FechaDesde}-style placeholder or a stored procedure argument). Nothing
else.

Responsibility: hold the data shape and its dict roundtrip. Does NOT:
  - parse SQL to discover parameters (sql_parameter_parser's job)
  - execute SQL
  - validate a user-entered value (report_parameter_values' job)
"""


@dataclass
class SqlParameterModel:
    name: str
    type: str = "string"  # date | number | string | boolean
    default: Any = None
    required: bool = False
    source: str = "sql_param"  # crystal_param | sql_param | procedure_param

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "type": self.type,
            "default": self.default,
            "required": self.required,
            "source": self.source,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SqlParameterModel":
        return cls(
            name=data["name"],
            type=data.get("type", "string"),
            default=data.get("default"),
            required=bool(data.get("required", False)),
            source=data.get("source", "sql_param"),
        )
