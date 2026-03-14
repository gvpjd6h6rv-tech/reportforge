# core/render/features/parameters.py
# Report parameters: {param.startDate}, {param.company}, etc.
# Parameters are passed at render time and available everywhere.
from __future__ import annotations
from datetime import date, datetime
from typing import Any


_PARAM_TYPES = {
    "string": str,
    "int":    int,
    "float":  float,
    "bool":   lambda v: str(v).lower() in ("1","true","yes"),
    "date":   lambda v: datetime.strptime(str(v), "%Y-%m-%d").strftime("%d/%m/%Y"),
}


class Parameters:
    """
    Holds typed report parameters with defaults and validation.

    Layout definition example:
        "parameters": [
            {"name": "startDate", "type": "date",   "default": "2025-01-01", "label": "Start Date"},
            {"name": "company",   "type": "string",  "default": "ACME Corp"},
            {"name": "minAmount", "type": "float",   "default": 0},
        ]

    Expression usage: {param.startDate}, {param.company}
    """

    def __init__(self, definitions: list[dict], values: dict | None = None):
        self._defs   = {d["name"]: d for d in (definitions or [])}
        self._values: dict[str, Any] = {}
        # Apply defaults
        for name, d in self._defs.items():
            self._values[name] = d.get("default", "")
        # Override with provided values
        for name, raw in (values or {}).items():
            self._values[name] = self._coerce(name, raw)

    def get(self, name: str, default: Any = "") -> Any:
        return self._values.get(name, default)

    def all(self) -> dict[str, Any]:
        return dict(self._values)

    def _coerce(self, name: str, value: Any) -> Any:
        d    = self._defs.get(name, {})
        ptype = d.get("type", "string")
        fn   = _PARAM_TYPES.get(ptype, str)
        try:
            return fn(value)
        except Exception:
            return value

    def inject_into_data(self, data: dict) -> dict:
        """Return a copy of data with param namespace injected."""
        return {**data, "param": dict(self._values)}

    def resolve(self, path: str) -> tuple[bool, Any]:
        """Resolve 'param.X' paths. Returns (handled, value)."""
        if path.startswith("param."):
            key = path[6:]
            return True, self._values.get(key, "")
        if path == "param":
            return True, self._values
        return False, None
