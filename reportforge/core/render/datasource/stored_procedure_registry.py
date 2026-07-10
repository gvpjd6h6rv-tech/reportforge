from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import sql_procedure_allowlist

"""
stored_procedure_registry — F19C. Holds the explicit, structured Stored
Procedure allowlist (id -> definition: datasourceId, procedure, enabled,
readOnly, timeoutSeconds, maxRows, params schema) and looks it up by ID.
Nothing else.

Responsibility:
  - load_config(path): read the JSON config file (pure data, no code) and
    register each entry in-memory. Never called automatically at import
    time — the caller (server startup, or a test) decides when to load,
    mirroring db_source_registry's own "nothing auto-registers" precedent.
  - register_definition(definition): validate the definition SHAPE only
    (required top-level keys present, params is a list) and store it. Does
    NOT validate the procedure identifier itself (stored_procedure_catalog.
    validate_procedure_identifier is the executor's job, at call time —
    this module stores whatever shape-valid definition it's given, exactly
    like db_source_registry.register() never validates a connection spec's
    credentials).
  - get_definition(id): the ONLY lookup surface this module exposes for
    execution — returns the full definition dict, or None.
  - list_enabled(): metadata for the UI's picker list — id/label/params
    ONLY (never datasourceId, never the real procedure name) so a client
    can build a dropdown without learning anything it doesn't need.
  - Syncs sql_procedure_allowlist: registering an ENABLED definition adds
    its procedure name to sql_procedure_allowlist (the low-level EXEC
    gate sql_safety_guard already trusts); disabling/removing a
    definition removes it. This is exactly the "upcoming...phase...
    populate it from a real, persisted catalog" sql_procedure_allowlist's
    own docstring already anticipated — this module IS that phase, for
    the allowlist side. sql_procedure_allowlist itself is never modified.

Does NOT:
  - execute SQL, open a connection, or validate parameters against a
    definition's params schema (stored_procedure_param_validator's job).
  - validate the procedure SQL identifier itself (stored_procedure_
    catalog.validate_procedure_identifier, called by the executor).
  - know about HTTP, UI, or the audit log.
"""

_REGISTRY: dict[str, dict[str, Any]] = {}

_REQUIRED_KEYS = ("id", "datasourceId", "procedure", "enabled", "readOnly", "timeoutSeconds", "maxRows", "params")


def _validate_shape(definition: dict[str, Any]) -> None:
    if not isinstance(definition, dict):
        raise ValueError("Stored procedure definition must be a dict")
    missing = [k for k in _REQUIRED_KEYS if k not in definition]
    if missing:
        raise ValueError(f"Stored procedure definition missing required keys: {missing}")
    if not isinstance(definition["params"], list):
        raise ValueError("Stored procedure definition 'params' must be a list")


def register_definition(definition: dict[str, Any]) -> None:
    _validate_shape(definition)
    proc_id = definition["id"]
    _REGISTRY[proc_id] = dict(definition)
    if definition["enabled"]:
        sql_procedure_allowlist.add_to_allowlist(definition["procedure"])
    else:
        sql_procedure_allowlist.remove_from_allowlist(definition["procedure"])


def load_config(path: str | Path) -> int:
    """Reads {"storedProcedures": [...]} from path and registers each
    entry. Returns the count registered. Raises ValueError on malformed
    JSON shape (fail-closed — a broken config file registers nothing
    silently partial)."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(raw.get("storedProcedures"), list):
        raise ValueError("Config must be a JSON object with a 'storedProcedures' array")
    for definition in raw["storedProcedures"]:
        register_definition(definition)
    return len(raw["storedProcedures"])


def get_definition(proc_id: str) -> dict[str, Any] | None:
    return _REGISTRY.get(proc_id)


def list_enabled() -> list[dict[str, Any]]:
    return [
        {"id": d["id"], "label": d.get("label", d["id"]), "params": list(d["params"])}
        for d in _REGISTRY.values()
        if d["enabled"]
    ]


def clear() -> None:
    """Test-only reset — mirrors db_source_registry._REGISTRY.clear() and
    sql_procedure_allowlist.clear_allowlist()."""
    for definition in _REGISTRY.values():
        sql_procedure_allowlist.remove_from_allowlist(definition["procedure"])
    _REGISTRY.clear()
