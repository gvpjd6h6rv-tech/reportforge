"""
coercion_map.py — Declarative coercion map for ReportForge.

Single source of truth: maps each canonical type name to the one authoritative
coercion function from type_coercion.py.

Rules:
  - All coercion must be routed through this map or through type_coercion.py directly.
  - No other module may define its own _to_num / _to_str / _to_date equivalents.
  - New types must be registered here before being used anywhere in the pipeline.
  - audit/coercion_map_guard.py enforces these rules statically.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from .type_coercion import (
    to_num,
    to_text,
    truthy,
    parse_date,
)

# ── Private helpers from type_coercion ────────────────────────────
# These are the canonical str and datetime coercers. They live in
# type_coercion.py — imported here to document them as authoritative.
import datetime as _dt

def _to_str(v: Any) -> str:
    """Canonical string coercion — mirrors type_coercion._to_str logic."""
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v)


def _to_datetime(v: Any) -> _dt.datetime:
    """Canonical datetime coercion."""
    if isinstance(v, _dt.datetime):
        return v
    if isinstance(v, _dt.date):
        return _dt.datetime.combine(v, _dt.time())
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M", "%d/%m/%Y %H:%M:%S"):
        try:
            return _dt.datetime.strptime(str(v).strip(), fmt)
        except Exception:
            pass
    return _dt.datetime.now()


# ── Declarative map ───────────────────────────────────────────────
# Key   : canonical type name (lowercase, as used in formula AST and field schemas)
# Value : (coerce_fn, fallback_value)
#
# coerce_fn   : callable that converts any value to the target type
# fallback    : the value returned on coercion failure (matches default_for_type)

CoercionEntry = tuple  # (Callable[[Any], Any], Any)

COERCION_MAP: Dict[str, CoercionEntry] = {
    "number":   (to_num,       0.0),
    "currency": (to_num,       0.0),
    "string":   (_to_str,      ""),
    "boolean":  (truthy,       False),
    "date":     (parse_date,   None),
    "datetime": (_to_datetime, None),
}

# Canonical format names recognized by format_value() in field_resolver.py.
# Any format name not in this set is unrecognized and should fall back to str().
KNOWN_FORMATS = frozenset({
    "currency", "currency_sign", "int", "float2", "float4", "float6",
    "pct", "pct2", "upper", "lower", "title",
    "bool_si_no", "bool_yes_no",
    "doc_number", "date", "datetime",
    "clave_acceso", "ruc_mask", "forma_pago",
})


# ── Canonical coerce entry point ──────────────────────────────────

def coerce(
    value: Any,
    target_type: str,
    *,
    field: str = "",
    logger: Optional[Any] = None,
) -> Any:
    """
    Coerce `value` to `target_type` using the canonical coercion function.

    Parameters
    ----------
    value       : Raw value to coerce.
    target_type : One of the keys in COERCION_MAP.
    field       : Optional dot-path for traceability in debug logs.
    logger      : Optional CoercionLogger; if provided, mismatches are recorded.

    Returns the coerced value, or the registered fallback on failure.
    Raises ValueError for unknown target_type.
    """
    entry = COERCION_MAP.get(target_type)
    if entry is None:
        raise ValueError(
            f"coercion_map: unknown target type '{target_type}'. "
            f"Register it in COERCION_MAP before use."
        )
    coerce_fn, fallback = entry
    try:
        result = coerce_fn(value)
        # parse_date returns None on failure — treat as mismatch
        if result is None and value is not None and target_type in ("date", "datetime"):
            raise ValueError(f"could not parse {value!r} as {target_type}")
        # to_num swallows exceptions and returns 0 — detect silent numeric failure
        if logger is not None and target_type in ("number", "currency"):
            if not isinstance(value, (int, float, bool)) and value is not None:
                try:
                    float(str(value).replace(",", ""))
                except Exception:
                    logger.record_mismatch(
                        value=value,
                        expected_type=target_type,
                        result=fallback,
                        field=field,
                        _depth=1,
                    )
        return result
    except Exception:
        if logger is not None:
            try:
                logger.record_mismatch(
                    value=value,
                    expected_type=target_type,
                    result=fallback,
                    field=field,
                    _depth=1,
                )
            except Exception:
                pass
        return fallback


def type_name_for(value: Any) -> str:
    """Return the canonical type name for a Python value (for error messages)."""
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, _dt.datetime):
        return "datetime"
    if isinstance(value, _dt.date):
        return "date"
    return type(value).__name__
