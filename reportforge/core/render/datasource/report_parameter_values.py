from __future__ import annotations

from dataclasses import dataclass
from datetime import date as _date
from typing import Any

from reportforge.core.render.datasource.report_parameter_model import ReportParameterModel

"""
report_parameter_values — validates and normalizes the CURRENT values a
user has entered for a report's declared parameters. Nothing else.

Responsibility: given a list of ReportParameterModel definitions and a
dict of raw values, decide per-parameter whether the value is valid
(missing-required check, basic type check), normalize simple values (date
strings to ISO-8601, numeric strings to int/float, boolean strings to
bool), and report one clear error per parameter. Does NOT:
  - render the left parameters panel
  - execute SQL
  - parse {?Parametro} placeholders
  - refresh preview
  - feed the Field Explorer
  - persist to the document (a later phase)

Dates are validated/normalized as ISO-8601 (YYYY-MM-DD) — the internal
storage shape a later UI phase's dd/mm/yyyy DISPLAY format converts
to/from; that display concern belongs to ParameterInputRenderer, not here.
"""


@dataclass
class ParameterValidationResult:
    valid: bool
    errors: dict[str, str]
    normalized_values: dict[str, Any]


def _validate_date(value: Any) -> tuple[bool, Any, str | None]:
    if isinstance(value, _date):
        return True, value.isoformat(), None
    if not isinstance(value, str):
        return False, None, f"Invalid date: {value!r} (expected an ISO date string YYYY-MM-DD)"
    try:
        _date.fromisoformat(value)
        return True, value, None
    except ValueError:
        return False, None, f"Invalid date: {value!r} (expected YYYY-MM-DD)"


def _validate_number(value: Any) -> tuple[bool, Any, str | None]:
    if isinstance(value, bool):
        return False, None, f"Invalid number: {value!r}"
    if isinstance(value, (int, float)):
        return True, value, None
    if isinstance(value, str):
        try:
            return True, (float(value) if "." in value else int(value)), None
        except ValueError:
            return False, None, f"Invalid number: {value!r}"
    return False, None, f"Invalid number: {value!r}"


def _validate_string(value: Any) -> tuple[bool, Any, str | None]:
    if value is None:
        return False, None, "Expected a string"
    return True, str(value), None


def _validate_boolean(value: Any) -> tuple[bool, Any, str | None]:
    if isinstance(value, bool):
        return True, value, None
    if isinstance(value, str) and value.strip().lower() in ("true", "false"):
        return True, value.strip().lower() == "true", None
    return False, None, f"Invalid boolean: {value!r}"


_VALIDATORS = {
    "date": _validate_date,
    "number": _validate_number,
    "string": _validate_string,
    "boolean": _validate_boolean,
}


def validate_parameter_values(
    parameters: list[ReportParameterModel],
    values: dict[str, Any],
) -> ParameterValidationResult:
    errors: dict[str, str] = {}
    normalized: dict[str, Any] = {}
    known_names = {p.name for p in parameters}

    for param in parameters:
        raw = values.get(param.name, param.default_value)
        if raw is None:
            if param.required:
                errors[param.name] = f"Missing required parameter: {param.name}"
            continue
        validator = _VALIDATORS.get(param.type, _validate_string)
        ok, normalized_value, message = validator(raw)
        if ok:
            normalized[param.name] = normalized_value
        else:
            errors[param.name] = message

    for name in values:
        if name not in known_names:
            errors[name] = f"Unknown parameter: {name}"

    return ParameterValidationResult(valid=len(errors) == 0, errors=errors, normalized_values=normalized)
