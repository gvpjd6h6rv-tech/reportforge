"""factura_normalizer — canonical SAP model -> factura contract payload.

Single responsibility: turn the canonical nested SAP invoice model
(meta / items / totales / empresa / cliente / fiscal / pago / observaciones)
into the FLAT factura payload declared by ``document_contract.FACTURA_*_KEYS``.

Pure function: no I/O, no network, no backend, no global state. The same
normalizer serves BOTH the SAP preview path and the RF export path, so the two
emit an identical payload for the same document.

It intentionally emits BOTH schemas as one superset:
  * NET / fiscal keys   (precio_unitario, subtotal, totales_valor_total …) → FV1
  * GROSS / PriceAfVAT   (precio_unitario_con_iva, precio_total_con_iva,
                          totales_subtotal_con_iva, meta_doc_total …)      → FV2
so a single payload feeds either layout with no empty field.
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


def _first(*values: Any) -> Any:
    """First non-None value, else None (keeps numeric types intact)."""
    for value in values:
        if value is not None:
            return value
    return None


def _normalize_items(model: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for raw in model.get("items") or []:
        it = dict(raw or {})
        qty = _first(it.get("cantidad"), it.get("qty"))
        pu_iva = it.get("precio_unitario_con_iva")
        line_gross = None
        if pu_iva is not None and qty is not None:
            line_gross = round(float(pu_iva) * float(qty), 2)
        items.append(
            {
                "codigo": str(it.get("codigo") or it.get("cod") or it.get("ItemCode") or "").strip(),
                "descripcion": str(it.get("descripcion") or it.get("desc") or it.get("ItemDescription") or "").strip(),
                "cantidad": qty,
                # Matches the exact FV1 (NET) fallback chain: descuento_pct is
                # a GROSS/SAP-model-only field and was never part of this
                # chain — adding it made a genuinely-absent descuento render
                # as "0.00" instead of blank, breaking FV1 SAP-vs-RF parity
                # (AE gate) by shifting column alignment on doc 2021215.
                "descuento": _first(it.get("descuento"), it.get("discount")),
                # NET (FV1)
                "precio_unitario": _first(it.get("precio_unitario"), it.get("price_unit")),
                "subtotal": _first(it.get("subtotal"), it.get("total")),
                # GROSS / PriceAfVAT (FV2)
                "precio_unitario_con_iva": pu_iva,
                "precio_total_con_iva": line_gross,
            }
        )
    return items


def normalize_factura(model: dict[str, Any]) -> dict[str, Any]:
    """Canonical SAP model -> factura contract payload (pure)."""
    empresa = dict(model.get("empresa") or {})
    cliente = dict(model.get("cliente") or {})
    meta = dict(model.get("meta") or {})
    fiscal = dict(model.get("fiscal") or {})
    pago = dict(model.get("pago") or {})
    totales = dict(model.get("totales") or {})
    obs = dict(model.get("observaciones") or {})

    items = _normalize_items(model)

    gross_subtotal = round(
        sum(i["precio_total_con_iva"] for i in items if i.get("precio_total_con_iva") is not None),
        2,
    )
    doc_total = float(meta.get("doc_total") or 0)

    return {
        # ── empresa ──
        "empresa_razon_social": _pick(empresa.get("razon_social"), empresa.get("nombre"), empresa.get("name")),
        "empresa_ruc": _pick(empresa.get("ruc"), empresa.get("tax_id")),
        "empresa_direccion_matriz": _pick(empresa.get("direccion_matriz"), empresa.get("direccion")),
        "empresa_direccion_sucursal": _pick(empresa.get("direccion_sucursal"), empresa.get("direccion")),
        "empresa_obligado_contabilidad": _pick(empresa.get("obligado_contabilidad"), empresa.get("obligado")),
        "empresa_agente_retencion": _pick(empresa.get("agente_retencion"), empresa.get("retencion")),
        "empresa_telefono": _pick(empresa.get("telefono")),
        "empresa_correo": _pick(empresa.get("correo"), empresa.get("email")),
        # ── cliente ──
        "cliente_razon_social": _pick(cliente.get("razon_social"), cliente.get("nombre")),
        "cliente_identificacion": _pick(cliente.get("identificacion"), cliente.get("ruc")),
        "cliente_direccion": _pick(cliente.get("direccion")),
        "cliente_telefono": _pick(cliente.get("telefono")),
        "cliente_telefono2": _pick(cliente.get("telefono2")),
        "cliente_email": _pick(cliente.get("correo"), cliente.get("email")),
        # ── fiscal ──
        "fiscal_numero_documento": _pick(fiscal.get("numero_documento"), meta.get("numero_documento"), meta.get("invoice_number")),
        "fiscal_numero_autorizacion": _pick(fiscal.get("numero_autorizacion"), meta.get("numero_autorizacion")),
        "fiscal_fecha_autorizacion": _pick(fiscal.get("fecha_autorizacion")),
        "fiscal_ambiente": _pick(fiscal.get("ambiente")),
        "fiscal_emision": _pick(fiscal.get("tipo_emision"), fiscal.get("emision")),
        "fiscal_clave_acceso": _pick(fiscal.get("clave_acceso"), meta.get("clave_acceso")),
        # ── cabecera / varios ──
        "fecha_emision": _pick(meta.get("doc_date"), fiscal.get("fecha_emision")),
        "guia_remision": _pick(fiscal.get("guia_remision")),
        "observaciones": _pick(obs.get("texto"), obs.get("comentario"), model.get("comentarios"), meta.get("comments")),
        # ── totales NET (FV1) ──
        "totales_subtotal_15": totales.get("subtotal_15", totales.get("subtotal")),
        "totales_subtotal_iva_0": totales.get("subtotal_iva_0", 0),
        "totales_subtotal_no_objeto_iva": totales.get("subtotal_no_objeto_iva", 0),
        "totales_subtotal_exento_iva": totales.get("subtotal_exento_iva", 0),
        "totales_subtotal_sin_impuestos": totales.get("subtotal_sin_impuestos", totales.get("subtotal")),
        "totales_descuento_total": totales.get("descuento_total", 0),
        "totales_valor_ice": totales.get("valor_ice", 0),
        "totales_iva_15": totales.get("iva_15", totales.get("iva")),
        "totales_propina": totales.get("propina", 0),
        "totales_valor_total": totales.get("valor_total", totales.get("total")),
        # ── totales GROSS / display (FV2) ──
        "totales_subtotal_con_iva": gross_subtotal,
        "totales_descuento_display": round(gross_subtotal - doc_total, 2),
        # ── forma de pago ──
        "forma_pago_descripcion": _pick(pago.get("descripcion"), pago.get("forma_pago")),
        "forma_pago_valor": pago.get("valor", totales.get("valor_total", totales.get("total"))),
        "forma_pago_plazo": _pick(pago.get("plazo")),
        "forma_pago_tiempo": _pick(pago.get("tiempo")),
        # ── documento: display number + gross total (FV2) ──
        "meta_invoice_number": meta.get("invoice_number"),
        "meta_doc_total": meta.get("doc_total"),
        # ── items ──
        "items": items,
    }
