from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

"""
sql_execution_result — represents the normalized result of running one SQL
command. Nothing else.

Responsibility: hold the data shape and its dict roundtrip. Does NOT:
  - execute SQL
  - validate SQL safety
  - sanitize errors
  - know about HTTP or UI
"""


@dataclass
class SqlExecutionResult:
    rows: list[dict] = field(default_factory=list)
    columns: list[str] = field(default_factory=list)
    elapsed_ms: float = 0.0
    row_count: int = 0
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "rows": list(self.rows),
            "columns": list(self.columns),
            "elapsed_ms": self.elapsed_ms,
            "row_count": self.row_count,
            "warnings": list(self.warnings),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SqlExecutionResult":
        return cls(
            rows=list(data.get("rows") or []),
            columns=list(data.get("columns") or []),
            elapsed_ms=data.get("elapsed_ms", 0.0),
            row_count=data.get("row_count", 0),
            warnings=list(data.get("warnings") or []),
        )
