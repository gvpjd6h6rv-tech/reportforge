"""guia_normalizer — canonical SAP model -> guia contract payload.

Single responsibility: turn the canonical nested SAP model
(meta / items / empresa / destinatario / traslado / origen / destino / fiscal)
into the FLAT guía payload declared by ``document_contract.GUIA_*_KEYS``.

Pure function: no I/O, no network, no backend, no global state. The same
normalizer serves BOTH the SAP preview path and the RF export path.

Scope note: this module does NOT decide which raw SAP column feeds
``item.referencia`` (e.g. ``codigo_adicional`` vs a free-text field) — that
source-shape decision belongs to the model ADAPTER (a separate module), whose
job is to populate the canonical model's ``items[].referencia`` /
``items[].unidad_medida`` in the first place. This normalizer's contract is
narrower and unconditional: IF the canonical model carries those keys on an
item, they MUST reach the payload under the exact contract keys — today
``build_guia_remision_a4_data`` drops ``referencia`` entirely (it never reads
it), which is the gap this normalizer closes.
"""
from __future__ import annotations

from typing import Any


def _pick(*values: Any) -> str:
    """First non-empty stringified value, else ''."""
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _normalize_items(model: dict[str, Any]) -> list[dict[str, Any]]:
    guia = dict(model.get("guia_remision") or {})
    raw_items = guia.get("items") or model.get("items") or []
    items: list[dict[str, Any]] = []
    for raw in raw_items:
        it = dict(raw or {})
        items.append(
            {
                "codigo": str(it.get("codigo") or it.get("ItemCode") or "").strip(),
                "descripcion": str(it.get("descripcion") or it.get("ItemDescription") or it.get("ItemName") or "").strip(),
                "cantidad": it.get("cantidad") if it.get("cantidad") is not None else it.get("Quantity"),
                "unidad_medida": _pick(it.get("unidad_medida"), it.get("u_medida"), it.get("Unit")),
                "referencia": _pick(it.get("referencia"), it.get("codigo_adicional")),
            }
        )
    return items


def normalize_guia(model: dict[str, Any]) -> dict[str, Any]:
    """Canonical SAP model -> guia contract payload (pure)."""
    guia = dict(model.get("guia_remision") or {})
    empresa = dict(model.get("empresa") or {})
    destinatario = dict(guia.get("destinatario") or model.get("destinatario") or {})
    traslado = dict(guia.get("traslado") or model.get("traslado") or {})
    origen = dict(guia.get("origen") or model.get("origen") or {})
    destino = dict(guia.get("destino") or model.get("destino") or {})
    fiscal = dict(guia.get("fiscal") or model.get("fiscal") or {})
    meta = dict(model.get("meta") or {})

    return {
        # ── empresa ──
        "empresa_razon_social": _pick(empresa.get("razon_social"), empresa.get("nombre")),
        "empresa_ruc": _pick(empresa.get("ruc")),
        "empresa_direccion": _pick(empresa.get("direccion"), empresa.get("direccion_matriz")),
        # ── destinatario / rutas ──
        "destinatario_razon_social": _pick(destinatario.get("razon_social"), destinatario.get("nombre")),
        "destinatario_identificacion": _pick(destinatario.get("identificacion")),
        "destinatario_direccion": _pick(destinatario.get("direccion")),
        "origen_direccion": _pick(origen.get("direccion")),
        "destino_direccion": _pick(destino.get("direccion")),
        # ── traslado ──
        "traslado_motivo": _pick(traslado.get("motivo")),
        "traslado_ruta": _pick(traslado.get("ruta")),
        "traslado_placa": _pick(traslado.get("placa_vehiculo"), traslado.get("placa")),
        "traslado_transportista_nombre": _pick(traslado.get("transportista_nombre")),
        "traslado_transportista_ruc": _pick(traslado.get("transportista_ruc")),
        # ── fiscal ──
        "fiscal_numero_documento": _pick(fiscal.get("numero_documento")),
        "fiscal_numero_autorizacion": _pick(fiscal.get("numero_autorizacion")),
        "fiscal_fecha_autorizacion": _pick(fiscal.get("fecha_autorizacion")),
        "fiscal_ambiente": _pick(fiscal.get("ambiente")),
        "fiscal_emision": _pick(fiscal.get("tipo_emision"), fiscal.get("emision")),
        "fiscal_clave_acceso": _pick(fiscal.get("clave_acceso")),
        # ── varios / documento ──
        "observaciones": _pick(guia.get("observaciones"), model.get("observaciones")),
        "meta_doc_num": _pick(meta.get("doc_num"), meta.get("doc_entry")),
        # ── items ──
        "items": _normalize_items(model),
    }
