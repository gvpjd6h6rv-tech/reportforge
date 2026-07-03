"""Canonical normalized-payload contracts, one declaration per document type.

Single responsibility: DECLARE the set of keys each document type's normalized
payload must expose — the keys layouts bind to via fieldPath. This module holds
NO logic, NO I/O and NO computation; it is a pure declaration plus a read-only
accessor.

Design context (see the architecture note):

    layout_key -> document_type -> canonical builder -> normalized payload -> renderer

The canonical intermediate model is SAP's nested shape
(meta / items / totales / empresa / cliente / fiscal). Per-doc-type normalizers
(separate modules) consume that model and MUST emit exactly these keys, so any
layout for the doc_type resolves with no empty field. Both the SAP preview path
and the RF export path go through the same normalizer, so this contract is the
single shared source of truth for both.

Item keys are declared bare (``codigo``, not ``item.codigo``); the ``item.``
prefix is a layout/fieldPath concern, not a payload concern.

Engine special fields (``RecordNumber``, ``PrintTime``, ``PrintDate``,
``PageNumber`` …) are supplied by the renderer at draw time, not by the payload,
and are therefore intentionally NOT part of any contract here.

The key sets below are the union of the fieldPaths bound by the currently
shipped layouts for each doc_type:
  * factura : factura_a4_fv1.json  ∪ factura_a4_fv2.json
  * guia    : guia_remision_fv1.json ∪ guia_remision_fv2.json
Adding a new layout that binds a new key means adding that key here first
(contract-first), then teaching the normalizer to emit it.
"""
from __future__ import annotations

# ── factura (Factura Electrónica FV1 + Nota de Entrega FV2) ──────────────────
# Superset: keeps FV1's NET fiscal keys AND FV2's GROSS/PriceAfVAT display keys
# so a single normalizer serves both layouts.
FACTURA_ROOT_KEYS = frozenset({
    # empresa
    "empresa_razon_social", "empresa_ruc", "empresa_direccion_matriz",
    "empresa_direccion_sucursal", "empresa_obligado_contabilidad",
    "empresa_agente_retencion", "empresa_telefono", "empresa_correo",
    # cliente
    "cliente_razon_social", "cliente_identificacion", "cliente_direccion",
    "cliente_telefono", "cliente_telefono2", "cliente_email",
    # fiscal
    "fiscal_numero_documento", "fiscal_numero_autorizacion",
    "fiscal_fecha_autorizacion", "fiscal_ambiente", "fiscal_emision",
    "fiscal_clave_acceso",  # bound by a barcode element, not a field element
    # cabecera / varios
    "fecha_emision", "guia_remision", "observaciones",
    # totales — NET (FV1 fiscal)
    "totales_subtotal_15", "totales_subtotal_iva_0",
    "totales_subtotal_no_objeto_iva", "totales_subtotal_exento_iva",
    "totales_subtotal_sin_impuestos", "totales_descuento_total",
    "totales_valor_ice", "totales_iva_15", "totales_propina",
    "totales_valor_total",
    # totales — GROSS / display (FV2 Nota de Entrega)
    "totales_subtotal_con_iva", "totales_descuento_display",
    # forma de pago
    "forma_pago_descripcion", "forma_pago_valor",
    "forma_pago_plazo", "forma_pago_tiempo",
    # documento — display number + gross total (FV2)
    "meta_invoice_number", "meta_doc_total",
})
FACTURA_ITEM_KEYS = frozenset({
    "codigo", "descripcion", "cantidad", "descuento",
    "precio_unitario", "subtotal",                 # NET (FV1)
    "precio_unitario_con_iva", "precio_total_con_iva",  # GROSS (FV2)
})

# ── guia (Guía de Remisión FV1 + FV2) ────────────────────────────────────────
GUIA_ROOT_KEYS = frozenset({
    # destinatario / rutas
    "destinatario_razon_social", "destinatario_identificacion",
    "destinatario_direccion", "destino_direccion", "origen_direccion",
    # empresa
    "empresa_razon_social", "empresa_ruc", "empresa_direccion",
    # fiscal
    "fiscal_numero_documento", "fiscal_numero_autorizacion",
    "fiscal_fecha_autorizacion", "fiscal_ambiente", "fiscal_emision",
    "fiscal_clave_acceso",
    # traslado
    "traslado_motivo", "traslado_ruta", "traslado_placa",
    "traslado_transportista_nombre", "traslado_transportista_ruc",
    # varios / documento
    "observaciones", "meta_doc_num",
})
GUIA_ITEM_KEYS = frozenset({
    "codigo", "descripcion", "cantidad", "unidad_medida", "referencia",
})

DOCUMENT_CONTRACTS: dict[str, dict[str, frozenset]] = {
    "factura": {"root": FACTURA_ROOT_KEYS, "item": FACTURA_ITEM_KEYS},
    "guia": {"root": GUIA_ROOT_KEYS, "item": GUIA_ITEM_KEYS},
}


def contract_for(doc_type: str) -> dict[str, frozenset]:
    """Return the ``{"root": frozenset, "item": frozenset}`` contract for a
    document type. Raises ``KeyError`` (listing the declared types) if unknown.
    """
    try:
        return DOCUMENT_CONTRACTS[doc_type]
    except KeyError:
        raise KeyError(
            f"Sin contrato declarado para doc_type={doc_type!r}. "
            f"Declarados: {sorted(DOCUMENT_CONTRACTS)}"
        ) from None
