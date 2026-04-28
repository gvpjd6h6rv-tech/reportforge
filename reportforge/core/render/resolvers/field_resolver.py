# core/render/resolvers/field_resolver.py
# Resolves dot-path field references and formats values.
from __future__ import annotations
from typing import Any, Optional

# Lazy import — logger is optional; never crashes if absent.
try:
    from ..expressions.coercion_logger import coercion_logger as _logger
except Exception:  # pragma: no cover
    _logger = None  # type: ignore[assignment]


class FieldResolver:
    """
    Resolves paths like "cliente.nombre", "item.precio",
    "totales.iva_12" against the report data dict.
    Thread-safe; creates child resolvers for item context.
    debug=True: logs every path that resolves to the default value.
    """
    def __init__(self, data: dict, item: Optional[dict] = None,
                 group_context: Optional[dict] = None,
                 debug: bool = False):
        self._data          = data
        self._item          = item
        self._group_context = group_context or {}
        self._debug         = debug

    # ── Context builders ──────────────────────────────────────────
    def with_item(self, item: dict) -> "FieldResolver":
        return FieldResolver(self._data, item, self._group_context, self._debug)

    def with_group(self, ctx: dict) -> "FieldResolver":
        return FieldResolver(self._data, self._item, {**self._group_context, **ctx}, self._debug)

    # ── Core resolution ───────────────────────────────────────────
    def get(self, path: str, default: Any = "") -> Any:
        if not path:
            return default
        path = path.strip("{}").strip()

        # item.campo → current item dict
        if self._item is not None:
            if path.startswith("item."):
                return self._item_get(path[5:], default)
            # items.campo or <dataset>.campo → look in current item first
            # This handles Crystal Reports {table.field} notation for detail rows
            if "." in path:
                prefix, _, field = path.partition(".")
                # If prefix matches a known dataset name and item has the field, resolve it
                data_val = self._data.get(prefix)
                if isinstance(data_val, list) and field in self._item:
                    return self._item_get(field, default)
                # Also handle single-level nested in item (item has dict sub-keys)
                if prefix in self._item and isinstance(self._item.get(prefix), dict):
                    return self._item[prefix].get(field, default)
            if "." not in path and path in self._item:
                return self._item_get(path, default)

        # group.campo → group context
        if path.startswith("group."):
            return self._group_context.get(path[6:], default)

        # Normal dot-path traversal
        result = _traverse(path, self._data, default)
        if self._debug and result == default and "." in path and _logger is not None:
            _logger.record_mismatch(
                value=path, expected_type="field_path",
                result=default, field=path,
            )
        return result

    def get_formatted(self, path: str, fmt: Optional[str] = None,
                      default: Any = "") -> str:
        val = self.get(path, default)
        if val is None or val == "":
            return str(default)
        return format_value(val, fmt)

    def resolve_text(self, text: str) -> str:
        """Resolve {field.path} placeholders in a text string."""
        if "{" not in text:
            return text
        import re
        def _repl(m):
            expr = m.group(1).strip()
            # Simple field path (no operators)
            if re.match(r'^[\w.]+$', expr):
                return str(self.get(expr, ""))
            return m.group(0)  # leave unresolved for expression evaluator
        return re.sub(r'\{([^}]+)\}', _repl, text)

    # ── Aggregations ──────────────────────────────────────────────
    @property
    def items(self) -> list[dict]:
        return self._data.get("items", [])

    @property
    def total_items(self) -> int:
        return len(self.items)

    def agg_sum(self, path: str, items: Optional[list] = None) -> float:
        lst = items if items is not None else self.items
        return sum(_to_float(_traverse(path, i, 0)) for i in lst)

    def agg_count(self, items: Optional[list] = None) -> int:
        lst = items if items is not None else self.items
        return len(lst)

    def agg_avg(self, path: str, items: Optional[list] = None) -> float:
        lst = items if items is not None else self.items
        return (self.agg_sum(path, lst) / len(lst)) if lst else 0.0

    def agg_min(self, path: str, items: Optional[list] = None) -> float:
        lst = items if items is not None else self.items
        vals = [_to_float(_traverse(path, i, None)) for i in lst if _traverse(path, i, None) is not None]
        return min(vals) if vals else 0.0

    def agg_max(self, path: str, items: Optional[list] = None) -> float:
        lst = items if items is not None else self.items
        vals = [_to_float(_traverse(path, i, None)) for i in lst if _traverse(path, i, None) is not None]
        return max(vals) if vals else 0.0

    # ── Internals ─────────────────────────────────────────────────
    def _item_get(self, key: str, default: Any) -> Any:
        if self._item is None:
            return default
        val = self._item.get(key, default)
        return default if val is None else val

    def __repr__(self) -> str:
        doc = self._data.get("meta", {}).get("doc_num", "?")
        ctx = f"[item={list(self._item.keys())[:2]}]" if self._item else ""
        return f"<FieldResolver doc={doc} {ctx}>"


# ── Helpers ───────────────────────────────────────────────────────
def _traverse(path: str, obj: Any, default: Any) -> Any:
    current = obj
    for key in path.split("."):
        if isinstance(current, dict):
            if key not in current:
                return default
            current = current[key]
        else:
            return default
    return default if current is None else current


def _to_float(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# ── Value formatter ───────────────────────────────────────────────
def format_value(value: Any, fmt: Optional[str]) -> str:
    """Apply a named formatter to a value."""
    if fmt is None:
        return str(value)
    try:
        if fmt == "currency":       return f"{float(value):,.2f}"
        if fmt == "currency_sign":  return f"$ {float(value):,.2f}"
        if fmt == "int":            return f"{round(float(value)):,}"
        if fmt == "float2":         return f"{float(value):.2f}"
        if fmt == "float4":         return f"{float(value):.4f}"
        if fmt == "float6":         return f"{float(value):.6f}"
        if fmt == "pct":            return f"{float(value):.1f}%"
        if fmt == "pct2":           return f"{float(value)*100:.1f}%"
        if fmt == "upper":          return str(value).upper()
        if fmt == "lower":          return str(value).lower()
        if fmt == "title":          return str(value).title()
        if fmt == "bool_si_no":     return "SI" if value else "NO"
        if fmt == "bool_yes_no":    return "YES" if value else "NO"
        if fmt == "doc_number":     return str(value)
        if fmt == "date":
            from datetime import datetime
            for pat in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
                try:
                    return datetime.strptime(str(value), pat).strftime("%d/%m/%Y")
                except ValueError:
                    pass
            return str(value)
        if fmt == "datetime":
            from datetime import datetime
            for pat in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
                try:
                    return datetime.strptime(str(value), pat).strftime("%d/%m/%Y %H:%M:%S")
                except ValueError:
                    pass
            return str(value)
        if fmt == "clave_acceso":
            s = str(value).replace(" ", "")
            return " ".join(s[i:i+10] for i in range(0, len(s), 10))
        if fmt == "ruc_mask":
            s = str(value)
            return f"{s[:9]}-{s[9:]}" if len(s) == 13 else s
        if fmt == "forma_pago":
            return {
                "01": "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO",
                "15": "COMPENSACIÓN DE DEUDAS", "16": "TARJETA DE DÉBITO",
                "17": "DINERO ELECTRÓNICO",      "18": "TARJETA PREPAGO",
                "19": "TARJETA DE CRÉDITO",      "20": "OTROS CON SISTEMA FINANCIERO",
                "21": "ENDOSO DE TÍTULOS",
            }.get(str(value), str(value))
    except (ValueError, TypeError, AttributeError):
        if _logger is not None:
            _logger.record_mismatch(
                value=repr(value)[:200],
                expected_type=f"format:{fmt}",
                result=str(value),
                field=fmt or "",
            )
    return str(value)

# Aliases for backward-compat with test_advanced_engine imports
_format_value = format_value
def _traverse(path, obj, default=''):
    current = obj
    for k in path.split('.'):
        if isinstance(current, dict):
            if k not in current: return default
            current = current[k]
        else: return default
    return default if current is None else current

