"""field_tree_builder.py — Build a Crystal Reports-compatible field tree from a real dataset.

Single Responsibility: receive the real dataset dict, enumerate all resolvable paths,
and produce a fieldTree structure that Field Explorer can render directly.
"""
from __future__ import annotations

_SECTION_ICONS: dict[str, str] = {
    "empresa": "🏢", "cliente": "👤", "fiscal": "🧾", "totales": "Σ",
    "pago": "💳", "forma_pago": "💳", "meta": "ℹ️", "items": "📦",
    "destinatario": "📦", "traslado": "🚚", "origen": "📍", "destino": "📍",
    "fecha": "📅", "hora": "🕐", "guia": "📋", "nota": "📝",
    "proveedor": "👤", "doc_sustento": "📄", "impuestos": "📊",
    "doc_modificado": "📋", "datos": "📑",
}

# Keys whose value is always a date string regardless of Python type
_DATE_KEYS: frozenset[str] = frozenset({
    "fecha_autorizacion", "fecha_emision", "fecha_inicio", "fecha_fin",
    "fecha_inicio_traslado", "fecha_fin_traslado", "emision", "doc_date",
})

# Keys that represent money amounts
_CURRENCY_KEYS: frozenset[str] = frozenset({
    "subtotal", "total", "iva", "importe_total", "valor_total", "precio_unitario",
    "precio_total", "descuento", "desc_lineal", "base_imponible", "valor_retenido",
    "valor", "subtotal_12", "subtotal_15", "subtotal_0", "subtotal_iva_0",
    "subtotal_sin_impuestos", "subtotal_no_objeto_iva", "subtotal_exento_iva",
    "descuento_total", "iva_12", "iva_15", "valor_ice", "propina",
    "ice_valor", "total_base_imponible", "total_retenido",
    "total_retenido_renta", "total_retenido_iva",
})

# Keys that represent dimensionless numbers
_NUMBER_KEYS: frozenset[str] = frozenset({
    "cantidad", "doc_num", "doc_entry", "numero", "porcentaje",
    "ice_porcentaje", "plazo",
})


def _infer_vtype(key: str, val: object) -> str:
    if key in _DATE_KEYS:
        return "date"
    if key in _CURRENCY_KEYS:
        return "currency"
    if key in _NUMBER_KEYS:
        return "number"
    if isinstance(val, float):
        return "currency"
    if isinstance(val, int) and not isinstance(val, bool):
        return "number"
    return "string"


def _leaf(section_key: str, field_key: str, val: object) -> dict:
    return {
        "path": f"{section_key}.{field_key}",
        "label": field_key,
        "vtype": _infer_vtype(field_key, val),
    }


def build_field_tree(dataset: dict) -> dict:
    """Return a Crystal Reports-style field tree derived entirely from *dataset*.

    Structure:
      {database: {label, icon, children: {<section>: {label, icon, children: {<field>: leaf}}}}}

    Top-level scalars (nota_numero, subtotal, etc.) land in a synthetic
    'datos_generales' section so the designer can still drag them.
    Items land in 'items' with path prefix 'item.'.
    """
    db_children: dict = {}
    top_scalars: dict = {}

    for key, val in dataset.items():
        if key == "items":
            continue
        if isinstance(val, dict):
            children = {
                k: _leaf(key, k, v)
                for k, v in val.items()
                if not isinstance(v, (dict, list))
            }
            if children:
                db_children[key] = {
                    "label": key,
                    "icon": _SECTION_ICONS.get(key, "📁"),
                    "children": children,
                }
        elif isinstance(val, list):
            continue
        else:
            # Top-level scalar
            top_scalars[key] = {
                "path": key,
                "label": key,
                "vtype": _infer_vtype(key, val),
            }

    if top_scalars:
        db_children["datos_generales"] = {
            "label": "datos generales",
            "icon": "📑",
            "children": top_scalars,
        }

    # Items section — uses item.* prefix
    items = dataset.get("items", [])
    if items and isinstance(items[0], dict):
        item_children = {
            k: {
                "path": f"item.{k}",
                "label": k,
                "vtype": _infer_vtype(k, v),
            }
            for k, v in items[0].items()
            if not isinstance(v, (dict, list))
        }
        if item_children:
            db_children["items"] = {
                "label": "items (detalle)",
                "icon": "📦",
                "children": item_children,
            }

    return {
        "database": {
            "label": "Campos de base de datos",
            "icon": "🗄️",
            "children": db_children,
        }
    }


_ALIAS_PREFIXES: frozenset[str] = frozenset({
    "forma_pago", "empresa", "fiscal", "cliente", "totales", "fecha", "guia",
    "destinatario", "traslado", "origen", "destino", "meta", "pago", "hora", "nota",
    "proveedor", "doc_sustento", "doc_modificado", "impuestos",
})


def build_dataset_paths(dataset: dict) -> list[str]:
    """Return all paths resolvable by field_resolver from *dataset*.

    Enumerates both the canonical dot-path (empresa.razon_social) AND
    the flat underscore alias (empresa_razon_social) for every section
    that belongs to _ALIAS_PREFIXES. This lets client-side code compare
    layout fieldPaths (which use underscore convention) against datasetPaths
    without needing to re-implement the alias bridge logic.

    Also includes:
      - Top-level scalars (nota_numero, subtotal, valor_total)
      - item.* paths from the first item row
    """
    seen: set[str] = set()
    paths: list[str] = []

    def _add(p: str) -> None:
        if p not in seen:
            seen.add(p)
            paths.append(p)

    for key, val in dataset.items():
        if key == "items":
            continue
        if isinstance(val, dict):
            for k2, v2 in val.items():
                if isinstance(v2, (dict, list)):
                    continue
                _add(f"{key}.{k2}")
                if key in _ALIAS_PREFIXES:
                    _add(f"{key}_{k2}")
        elif isinstance(val, list):
            continue
        else:
            _add(key)

    items = dataset.get("items", [])
    if items and isinstance(items[0], dict):
        for k in items[0]:
            _add(f"item.{k}")

    return paths
