"""model_adapters — reshape each source's raw model into the canonical model.

Single responsibility: bridge two DIFFERENT raw source shapes into the ONE
canonical nested model (meta / items / totales / empresa / cliente / fiscal /
pago / observaciones / guia_remision) that ``factura_normalizer`` and
``guia_normalizer`` consume. Neither normalizer should ever branch on "which
path built this" — that decision lives here, once, per source.

Pure functions: no I/O, no network, no backend, no global state.

Sources adapted:
  * ``adapt_sap_model``         — services/universal_invoice_builder.py's
                                   build_invoice_model() output (SAP preview path).
  * ``adapt_rf_invoice_model``  — reportforge/core/models/invoice_model.py's
                                   build_invoice_model() output (RF factura export path).
  * ``adapt_rf_remision_model`` — reportforge/core/models/remision_model.py's
                                   build_remision_model() output (RF guia export path).

Both raw shapes are read-only inputs here; this module returns a NEW dict
tree and never mutates its argument.

Documented, evidence-based gaps (left as None/empty rather than invented):
  * RF's own invoice_model has no separate NET (pre-VAT) unit price — its
    single ``precio_unitario`` field IS the PriceAfVAT/gross value (confirmed:
    it renders as "2.6000" against a GROSS-priced layout). There is no source
    for the FV1 NET price/subtotal when the RF path is used, so
    ``precio_unitario``/``subtotal`` (NET) are left ``None`` for that path.
  * SAP's raw guide_block (``model["guia_remision"]``) has no source field for
    ``traslado.ruta`` or ``guia_remision.fiscal.fecha_autorizacion`` distinct
    from the invoice's own fiscal envelope — left as documented gaps / reused
    from the shared invoice fiscal block, never fabricated.
"""
from __future__ import annotations

from typing import Any


def _dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


# ── SAP (services/universal_invoice_builder.py::build_invoice_model) ────────

def _adapt_sap_guia_items(guide_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for raw in guide_items or []:
        it = _dict(raw)
        items.append(
            {
                "codigo": it.get("codigo"),
                "descripcion": it.get("descripcion"),
                "cantidad": it.get("cantidad"),
                # SAP's raw guide item has no unit-of-measure source today.
                "unidad_medida": it.get("unidad_medida"),
                # THE decision for this commit: referencia falls back to
                # codigo_adicional (SAP's raw guide-item secondary code) when
                # no direct referencia value is present.
                "referencia": it.get("referencia") or it.get("codigo_adicional"),
            }
        )
    return items


def _adapt_sap_guia_remision(raw_model: dict[str, Any]) -> dict[str, Any]:
    guide = _dict(raw_model.get("guia_remision"))
    if not guide:
        return {}
    transporte = _dict(guide.get("transporte"))
    transportista = _dict(guide.get("transportista"))
    invoice_fiscal = _dict(raw_model.get("fiscal"))  # shared SRI envelope

    return {
        "destinatario": _dict(guide.get("destinatario")),
        # Best-available SAP source for an address-shaped field: the
        # establishment/arrival POINT text (U_PUNTO_PART / U_PUNTO_LLEGADA for
        # FVE_002; SRI point codes for FVE_001). Not a street address field —
        # documented approximation, not a fabricated value.
        "origen": {"direccion": guide.get("punto_partida")},
        "destino": {"direccion": guide.get("punto_llegada")},
        "traslado": {
            "motivo": guide.get("motivo"),
            # No SAP source for a distinct "ruta" (route) field — documented gap.
            "ruta": None,
            "placa_vehiculo": transporte.get("placa"),
            "transportista_nombre": transportista.get("nombre"),
            "transportista_ruc": transportista.get("ruc"),
            "fecha_inicio": guide.get("fecha_inicio"),
            "fecha_fin": guide.get("fecha_fin"),
        },
        "fiscal": {
            # The guide's OWN document number/authorization (distinct from the
            # related invoice's), plus the invoice's shared SRI environment
            # fields — SAP's guide_block carries no separate ambiente/clave_acceso.
            "numero_documento": guide.get("numero_guia"),
            "numero_autorizacion": guide.get("numero_autorizacion_guia"),
            "fecha_autorizacion": invoice_fiscal.get("fecha_autorizacion"),
            "ambiente": invoice_fiscal.get("ambiente"),
            "emision": invoice_fiscal.get("tipo_emision"),
            "clave_acceso": invoice_fiscal.get("clave_acceso"),
        },
        "items": _adapt_sap_guia_items(guide.get("items")),
        "observaciones": guide.get("observaciones"),
    }


def adapt_sap_model(raw_model: dict[str, Any]) -> dict[str, Any]:
    """SAP's build_invoice_model() output -> canonical model (pure).

    SAP's raw shape is already the nested canonical shape for the
    meta/items/totales/empresa/cliente/fiscal/pago/observaciones fields (they
    pass through unchanged); the real reshaping work is the embedded
    ``guia_remision`` (guide) block, whose raw field names/nesting differ from
    the canonical ``traslado``/``origen``/``destino`` shape the normalizers use.
    """
    raw_model = _dict(raw_model)
    canonical = {
        "meta": _dict(raw_model.get("meta")),
        "empresa": _dict(raw_model.get("empresa")),
        "cliente": _dict(raw_model.get("cliente")),
        "fiscal": _dict(raw_model.get("fiscal")),
        "pago": _dict(raw_model.get("pago")),
        "totales": _dict(raw_model.get("totales")),
        "items": list(raw_model.get("items") or []),
        "observaciones": raw_model.get("observaciones"),
    }
    guia = _adapt_sap_guia_remision(raw_model)
    if guia:
        canonical["guia_remision"] = guia
    return canonical


# ── RF (reportforge/core/models/invoice_model.py::build_invoice_model) ──────

def _adapt_rf_items(raw_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for raw in raw_items or []:
        it = _dict(raw)
        items.append(
            {
                "codigo": it.get("codigo"),
                "descripcion": it.get("descripcion"),
                "cantidad": it.get("cantidad"),
                "descuento": it.get("descuento"),
                # RF's own "precio_unitario"/"subtotal" ARE the gross
                # (PriceAfVAT) values — there is no separate NET source on
                # this path, so the NET keys stay None (documented gap; see
                # module docstring) rather than being fabricated.
                "precio_unitario": None,
                "subtotal": None,
                "precio_unitario_con_iva": it.get("precio_unitario"),
                "precio_total_con_iva": it.get("precio_total", it.get("subtotal")),
            }
        )
    return items


def adapt_rf_invoice_model(raw_model: dict[str, Any]) -> dict[str, Any]:
    """RF's build_invoice_model() output -> canonical model (pure).

    RF's raw shape nests empresa/cliente/fiscal/pago/totales close to
    canonical already, but keeps the document display number, gross total and
    emission date as flat top-level keys (``nota_numero``, ``valor_total``,
    ``fecha.emision``) instead of under ``meta``, and its own
    ``observaciones`` is a bare string rather than the canonical
    meta.comments slot the normalizer reads.
    """
    raw_model = _dict(raw_model)
    meta = _dict(raw_model.get("meta"))
    fecha = _dict(raw_model.get("fecha"))
    meta = {
        **meta,
        "invoice_number": raw_model.get("nota_numero"),
        "doc_total": raw_model.get("valor_total"),
        "comments": raw_model.get("observaciones"),
        "doc_date": fecha.get("emision"),
    }
    pago_block = _dict(raw_model.get("pago"))
    forma_pago = _dict(raw_model.get("forma_pago"))
    pago = {
        **pago_block,
        "descripcion": forma_pago.get("descripcion"),
        "valor": forma_pago.get("valor", pago_block.get("total")),
        "plazo": forma_pago.get("plazo", pago_block.get("plazo")),
        "tiempo": forma_pago.get("tiempo"),
    }
    return {
        "meta": meta,
        "empresa": _dict(raw_model.get("empresa")),
        "cliente": _dict(raw_model.get("cliente")),
        "fiscal": _dict(raw_model.get("fiscal")),
        "pago": pago,
        "totales": _dict(raw_model.get("totales")),
        "items": _adapt_rf_items(raw_model.get("items")),
        # RF's own invoice_model carries no guide-of-remission data — no
        # guia_remision key is emitted (normalizers already treat it as
        # optional, defaulting every guia_remision.* field to empty).
        "observaciones": None,
    }


# ── RF (reportforge/core/models/remision_model.py::build_remision_model) ────

def adapt_rf_remision_model(raw_model: dict[str, Any]) -> dict[str, Any]:
    """RF's build_remision_model() output -> canonical model (pure).

    Unlike the SAP/RF-factura sources, this one is already shaped almost
    exactly like the canonical model guia_normalizer expects: destinatario/
    traslado/origen/destino/fiscal live at the model's TOP LEVEL (no
    guia_remision wrapper — guia_normalizer's own field lookups already fall
    back from ``guia_remision.X`` to top-level ``X`` for this reason), and
    items already carry unidad_medida/referencia natively (confirmed against
    reportforge/core/models/remision_queries.py's fetch_remision_fve1/fve2).
    This adapter exists for the same reason adapt_sap_model/adapt_rf_invoice_model
    do — one explicit, tested seam per source, so guia_normalizer never has to
    guess which source produced its input — even though today it's a
    near-identity passthrough.
    """
    raw_model = _dict(raw_model)
    return {
        "meta": _dict(raw_model.get("meta")),
        "empresa": _dict(raw_model.get("empresa")),
        "destinatario": _dict(raw_model.get("destinatario")),
        "traslado": _dict(raw_model.get("traslado")),
        "origen": _dict(raw_model.get("origen")),
        "destino": _dict(raw_model.get("destino")),
        "fiscal": _dict(raw_model.get("fiscal")),
        "items": list(raw_model.get("items") or []),
        "observaciones": raw_model.get("observaciones"),
    }
