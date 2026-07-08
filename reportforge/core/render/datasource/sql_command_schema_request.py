from __future__ import annotations

import re
from typing import Any

from .sql_command_model import SqlCommandModel

"""
sql_command_schema_request — resolves the concrete bind dict a schema
discovery preview needs from a SqlCommandModel's declared parameters and
the caller-supplied explicit values. Nothing else.

Responsibility: apply the fail-closed parameter contract (UDS 4.1 Fase
16) BEFORE any SQL runs:
  1. an explicit value always wins.
  2. a required parameter with no explicit value is rejected.
  3. an optional parameter with no explicit value falls back to its
     declared default — never a fabricated/dummy value.
  4. an optional parameter with no explicit value and no declared
     default is only an error if the prepared SQL actually binds it
     (":name" appears in .sql); otherwise it's silently omitted
     (unused bind, harmless).
  5. any parameter_values key not declared on the command is rejected —
     no phantom input reaches the executor.

Does NOT:
  - execute SQL, connect to any datasource, or call sql_executor/
    sql_schema_inspector — this only computes a dict, or raises
    ValueError with the exact reason, never touches I/O.
  - accept raw Crystal-style "{?Param}" — that's already rejected by
    SqlCommandModel.__post_init__ before an instance can even exist.
"""


def resolve_bind_values(sql_command: SqlCommandModel, parameter_values: dict[str, Any] | None) -> dict[str, Any]:
    parameter_values = parameter_values or {}
    declared = {p["name"]: p for p in sql_command.parameters}

    extra = sorted(set(parameter_values) - set(declared))
    if extra:
        raise ValueError(f"Unexpected parameter(s) not declared in this command: {extra}")

    resolved: dict[str, Any] = {}
    for name, param in declared.items():
        if name in parameter_values:
            resolved[name] = parameter_values[name]
            continue
        if param.get("required"):
            raise ValueError(f"Missing required parameter: {name!r}")
        default = param.get("default")
        if default is not None:
            resolved[name] = default
            continue
        if re.search(rf"(?<!:):{re.escape(name)}\b", sql_command.sql):
            raise ValueError(f"Parameter {name!r} has no explicit value and no default, but the SQL binds it")

    return resolved
