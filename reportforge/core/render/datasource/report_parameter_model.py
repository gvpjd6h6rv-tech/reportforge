from __future__ import annotations

from dataclasses import dataclass
from typing import Any

"""
report_parameter_model — represents a report parameter DEFINITION (the
CR-like "Fecha Desde" / "Fecha Hasta" entries a report declares, not a
user-entered value — see report_parameter_values.py for that). Nothing
else.

Responsibility: hold the data shape and its dict roundtrip. Does NOT:
  - parse SQL to discover parameters
  - execute SQL
  - validate a user-entered value against this definition (that's
    report_parameter_values.py's job)
  - open any UI
  - touch the document serializer (a later phase)
"""


@dataclass
class ReportParameterModel:
    name: str
    label: str
    type: str = "string"  # date | number | string | boolean
    required: bool = False
    default_value: Any = None
    source: str = "manual"  # sql_command | stored_procedure | manual

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "type": self.type,
            "required": self.required,
            "default_value": self.default_value,
            "source": self.source,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ReportParameterModel":
        return cls(
            name=data["name"],
            label=data.get("label", data["name"]),
            type=data.get("type", "string"),
            required=bool(data.get("required", False)),
            default_value=data.get("default_value"),
            source=data.get("source", "manual"),
        )
