from __future__ import annotations

from typing import Any

"""
stored_procedure_param_validator — validates a raw params dict against a
Stored Procedure definition's declared params schema. Nothing else.

Responsibility:
  - reject any param name not declared in the definition's schema
    ("extra param").
  - reject a missing value for any param declared required=True.
  - reject a value whose Python type does not match the declared type
    ("string" | "number" | "boolean" | "date" — "date" accepted as a
    string, format validation is a later concern, not this phase's).
  - enforce maxLength for "string" params.
  - fill in a declared "default" for an optional param whose value is
    absent, when the definition provides one; otherwise the key is simply
    omitted from the returned dict (never fabricated as None/"").

Does NOT:
  - know about the procedure identifier, datasource, SQL text, or
    execution (stored_procedure_executor's job).
  - know about HTTP or the audit log.
  - accept SQL text as a parameter value's TYPE — a param typed "string"
    may contain arbitrary text, but it is always passed to the driver as
    a bound value, never concatenated into SQL (stored_procedure_executor
    enforces that separately; this module only checks shape/type/length).
"""


class StoredProcedureParamError(ValueError):
    """Raised with a safe-to-show reason — never echoes the offending value."""


_TYPE_CHECKERS = {
    "string": lambda v: isinstance(v, str),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "date": lambda v: isinstance(v, str),
}


def validate_params(definition: dict[str, Any], raw_params: dict[str, Any] | None) -> dict[str, Any]:
    raw_params = raw_params or {}
    if not isinstance(raw_params, dict):
        raise StoredProcedureParamError("params must be an object")

    schema = {p["name"]: p for p in definition.get("params", [])}

    extra = [name for name in raw_params if name not in schema]
    if extra:
        raise StoredProcedureParamError(f"Unknown parameter(s) not declared for this procedure: {sorted(extra)}")

    validated: dict[str, Any] = {}
    for name, spec in schema.items():
        has_value = name in raw_params and raw_params[name] is not None
        if not has_value:
            if spec.get("required", False):
                raise StoredProcedureParamError(f"Missing required parameter: {name!r}")
            if "default" in spec:
                validated[name] = spec["default"]
            continue

        value = raw_params[name]
        expected_type = spec.get("type", "string")
        checker = _TYPE_CHECKERS.get(expected_type)
        if checker is None:
            raise StoredProcedureParamError(f"Unsupported declared type for parameter {name!r}: {expected_type!r}")
        if not checker(value):
            raise StoredProcedureParamError(f"Parameter {name!r} must be of type {expected_type!r}")

        if expected_type == "string" and "maxLength" in spec and len(value) > spec["maxLength"]:
            raise StoredProcedureParamError(f"Parameter {name!r} exceeds maxLength={spec['maxLength']}")

        validated[name] = value

    return validated
