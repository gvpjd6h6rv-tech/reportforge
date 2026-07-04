"""canonical_fixtures — golden canonical-model fixtures for parity tests.

Single responsibility: provide reusable, evidence-based canonical models (the
meta/empresa/cliente/fiscal/pago/totales/items shape factura_normalizer and
guia_normalizer consume) and their SAP-raw / RF-raw equivalents, so parity
tests don't each hand-roll their own fixtures.

All values are grounded in real documents observed live during commit #6's
validation (docnum 1007542 / HUANG XIRU, factura FV2 and guia FV2; docnum
2021215, factura FV1 structural shape) — not invented data. Where SAP and RF
sources are known to genuinely diverge (company contact info, item NET
pricing — see core/contracts/model_adapters.py's module docstring), the RF
raw fixture reflects RF's OWN real values, not a copy of SAP's.

Pure data only: no I/O, no DB, no network.
"""
from __future__ import annotations

from typing import Any


def sap_raw_factura_model_9501() -> dict[str, Any]:
    """SAP's build_invoice_model() output shape for docnum 1007542 (HUANG XIRU)."""
    return {
        "meta": {
            "doc_entry": 55142, "doc_num": 1007542, "obj_type": "13",
            "currency": "USD", "invoice_number": "000009501", "doc_total": 106.41,
            "doc_date": "2026-04-24",
        },
        "empresa": {
            "razon_social": "CAROLINA JULIA CHANG AJOY", "ruc": "0913042669001",
            "direccion_matriz": "COLON 426", "telefono": "2530152",
            "correo": "supermotosybicicletas@gmail.com",
        },
        "cliente": {
            "razon_social": "HUANG XIRU", "identificacion": "1311940512001",
            "direccion": "COLON 516 Y CHIMBORAZO Y BOYACA", "telefono": "SN",
        },
        "fiscal": {
            "ambiente": "1", "tipo_emision": "1", "numero_documento": "000009501",
            "numero_autorizacion": "CLAVE-SAP", "fecha_autorizacion": "2026-04-24",
            "clave_acceso": "CLAVE-SAP",
        },
        "pago": {"descripcion": "", "valor": 106.41, "plazo": None, "tiempo": None},
        "totales": {
            "subtotal_15": 0.0, "subtotal_iva_0": 112.0, "subtotal_sin_impuestos": 112.0,
            "subtotal_no_objeto_iva": 0.0, "subtotal_exento_iva": 0.0,
            "descuento_total": 5.59, "valor_ice": 0.0, "iva_15": 0.0,
            "propina": 0.0, "valor_total": 106.41,
        },
        "items": [
            # SAP's real raw item already carries BOTH the NET (FV1) and
            # GROSS/PriceAfVAT (FV2, precio_unitario_con_iva) fields directly
            # — factura_normalizer._normalize_items reads precio_unitario_con_iva
            # straight off the raw item with no NET->GROSS fallback, so a
            # fixture missing it would wrongly report None for FV2 pricing.
            {"codigo": "BINFL.09", "descripcion": "INFLADOR PORTATIL GP-47L PLASTICO MEDIANO REVERSIBLE GIYO (ECO)",
             "cantidad": 10.0, "precio_unitario": 2.60, "descuento": 0.0, "subtotal": 26.00, "precio_total": 26.00,
             "precio_unitario_con_iva": 2.60},
            {"codigo": "BCANA.01", "descripcion": "CANASTILLA BIC.TRINCHE TAIWAN 5/32\" X16",
             "cantidad": 80.0, "precio_unitario": 0.09, "descuento": 0.0, "subtotal": 7.20, "precio_total": 7.20,
             "precio_unitario_con_iva": 0.09},
            {"codigo": "BEJE.25", "descripcion": "EJE POSTERIOR SUPER LARGO C/BOCIN 3/8x200mm TAIWAN",
             "cantidad": 24.0, "precio_unitario": 0.95, "descuento": 0.0, "subtotal": 22.80, "precio_total": 22.80,
             "precio_unitario_con_iva": 0.95},
            {"codigo": "BEJE.11", "descripcion": "EJE THOMPSON 35 FIRST TAIWAN",
             "cantidad": 5.0, "precio_unitario": 3.30, "descuento": 0.0, "subtotal": 16.50, "precio_total": 16.50,
             "precio_unitario_con_iva": 3.30},
            {"codigo": "BEJE.15", "descripcion": "EJE THOMPSON 40 FIRST TAIWAN",
             "cantidad": 5.0, "precio_unitario": 3.80, "descuento": 0.0, "subtotal": 19.00, "precio_total": 19.00,
             "precio_unitario_con_iva": 3.80},
            {"codigo": "BTUBO.66", "descripcion": "TUBO 24X1-3/8 A/V DURO TAILANDIA",
             "cantidad": 10.0, "precio_unitario": 2.05, "descuento": 0.0, "subtotal": 20.50, "precio_total": 20.50,
             "precio_unitario_con_iva": 2.05},
        ],
        "observaciones": None,
    }


def rf_raw_invoice_model_9501() -> dict[str, Any]:
    """RF's build_invoice_model() output shape for the SAME docnum 1007542.

    Deliberately keeps RF's OWN real, independently-sourced values where they
    genuinely diverge from SAP's (company contact fields — a documented,
    pre-existing data-source difference, see model_adapters.py) — this
    fixture is not a copy of SAP's, it is RF's real equivalent.
    """
    return {
        "meta": {"doc_entry": 55142, "doc_num": 1007542, "obj_type": "13", "currency": "USD"},
        "empresa": {
            # Post RF-EMPRESA-RAZON-SOCIAL-VS-COMERCIAL-1 fix: razon_social
            # comes from OADM.AliasName, nombre_comercial from OADM.CompnyName.
            "razon_social": "CAROLINA JULIA CHANG AJOY CHONG",
            "nombre_comercial": "SUPER MOTOS Y BICICLETAS",
            "ruc": "0913042669001", "direccion_matriz": "COLON 426 ENTRE CHILE Y CHIMBORAZO GUAYAQUIL ECUADOR",
            "telefono": "(593) 4-530152", "correo": "chang_carolina@hotmail.com",
        },
        "cliente": {
            "razon_social": "HUANG XIRU", "nombre": "HUANG XIRU",
            "identificacion": "1311940512001",
            "direccion": "COLON 516 Y CHIMBORAZO Y BOYACA", "telefono": "SN",
        },
        "fiscal": {
            # RF-AMBIENTE-RAW-CODE-1: raw source code, matching SAP's
            # passthrough (no text mapping in the canonical payload).
            "ambiente": "1", "tipo_emision": "1", "numero_documento": "000009501",
            "numero_autorizacion": "CLAVE-RF", "fecha_autorizacion": "2026-04-24",
            "clave_acceso": "CLAVE-RF",
        },
        "pago": {"forma_pago_fe": "01", "plazo": None, "total": 106.41},
        "forma_pago": {"descripcion": "", "valor": 106.41, "plazo": None, "tiempo": None},
        "fecha": {"emision": "2026-04-24"},
        "hora": {"emision": "17:22"},
        "guia": {"remision": None},
        "observaciones": None,
        "nota_numero": "000009501",
        "subtotal": 112.0,
        "descuento": 5.59,
        "valor_total": 106.41,
        "items": [
            # docnum 1007542's items are all TaxCode=IVA_EXE (VatPrcnt=0,
            # confirmed live via SSMS) so NET == GROSS here by real business
            # fact, not by omission — precio_unitario_con_iva/precio_total_con_iva
            # are still real INV1.PriceAfVAT/GTotal reads, just numerically
            # equal to precio_unitario/subtotal for a 0%-tax line.
            {"numero": 1, "codigo": "BINFL.09", "descripcion": "INFLADOR PORTATIL GP-47L PLASTICO MEDIANO REVERSIBLE GIYO (ECO)",
             "cantidad": 10.0, "precio_unitario": 2.60, "descuento": 0.0, "subtotal": 26.00, "precio_total": 26.00,
             "precio_unitario_con_iva": 2.60, "precio_total_con_iva": 26.00, "vat_prcnt": 0.0, "referencia": None},
            {"numero": 2, "codigo": "BCANA.01", "descripcion": "CANASTILLA BIC.TRINCHE TAIWAN 5/32\" X16",
             "cantidad": 80.0, "precio_unitario": 0.09, "descuento": 0.0, "subtotal": 7.20, "precio_total": 7.20,
             "precio_unitario_con_iva": 0.09, "precio_total_con_iva": 7.20, "vat_prcnt": 0.0, "referencia": None},
            {"numero": 3, "codigo": "BEJE.25", "descripcion": "EJE POSTERIOR SUPER LARGO C/BOCIN 3/8x200mm TAIWAN",
             "cantidad": 24.0, "precio_unitario": 0.95, "descuento": 0.0, "subtotal": 22.80, "precio_total": 22.80,
             "precio_unitario_con_iva": 0.95, "precio_total_con_iva": 22.80, "vat_prcnt": 0.0, "referencia": None},
            {"numero": 4, "codigo": "BEJE.11", "descripcion": "EJE THOMPSON 35 FIRST TAIWAN",
             "cantidad": 5.0, "precio_unitario": 3.30, "descuento": 0.0, "subtotal": 16.50, "precio_total": 16.50,
             "precio_unitario_con_iva": 3.30, "precio_total_con_iva": 16.50, "vat_prcnt": 0.0, "referencia": None},
            {"numero": 5, "codigo": "BEJE.15", "descripcion": "EJE THOMPSON 40 FIRST TAIWAN",
             "cantidad": 5.0, "precio_unitario": 3.80, "descuento": 0.0, "subtotal": 19.00, "precio_total": 19.00,
             "precio_unitario_con_iva": 3.80, "precio_total_con_iva": 19.00, "vat_prcnt": 0.0, "referencia": None},
            {"numero": 6, "codigo": "BTUBO.66", "descripcion": "TUBO 24X1-3/8 A/V DURO TAILANDIA",
             "cantidad": 10.0, "precio_unitario": 2.05, "descuento": 0.0, "subtotal": 20.50, "precio_total": 20.50,
             "precio_unitario_con_iva": 2.05, "precio_total_con_iva": 20.50, "vat_prcnt": 0.0, "referencia": None},
        ],
        "totales": {
            "subtotal_15": 0.0, "subtotal_iva_0": 112.0, "subtotal_sin_impuestos": 112.0,
            "subtotal_no_objeto_iva": 0.0, "subtotal_exento_iva": 0.0,
            "descuento_total": 5.59, "valor_ice": 0.0, "iva_15": 0.0,
            "propina": 0.0, "valor_total": 106.41,
        },
    }


def sap_raw_remision_model_9501() -> dict[str, Any]:
    """SAP's guide_block-bearing invoice model shape for the same guia FV2 doc."""
    model = sap_raw_factura_model_9501()
    model["guia_remision"] = {
        "destinatario": {"razon_social": "HUANG XIRU", "identificacion": "1311940512001",
                          "tipo_identificacion": "04", "direccion": "COLON 516 Y CHIMBORAZO Y BOYACA"},
        "punto_partida": None, "punto_llegada": None,
        "motivo": "", "transporte": {}, "transportista": {},
        "fecha_inicio": "2026-04-24", "fecha_fin": "2026-04-24",
        "numero_guia": "000009501", "numero_autorizacion_guia": "CLAVE-SAP",
        "items": [
            {"codigo": it["codigo"], "descripcion": it["descripcion"], "cantidad": it["cantidad"]}
            for it in model["items"]
        ],
        "observaciones": None,
    }
    return model


def rf_raw_remision_model_9501() -> dict[str, Any]:
    """RF's build_remision_model() output shape for docnum 1007542 — already
    near-canonical (destinatario/traslado/origen/destino/fiscal at top level,
    items with unidad_medida/referencia native)."""
    return {
        "meta": {"doc_entry": 55142, "doc_num": 1007542, "obj_type": "15", "currency": "USD"},
        "empresa": {
            "razon_social": "CAROLINA JULIA CHANG AJOY CHONG",
            "nombre_comercial": "SUPER MOTOS Y BICICLETAS",
            "ruc": "0913042669001",
        },
        "destinatario": {"razon_social": "HUANG XIRU", "identificacion": "1311940512001",
                          "tipo_identificacion": "04", "direccion": "COLON 516 Y CHIMBORAZO Y BOYACA"},
        "fiscal": {"ambiente_raw": "1", "ambiente": "1", "tipo_emision": "1",
                   "numero_documento": "000009501", "numero_autorizacion": "CLAVE-RF",
                   "fecha_autorizacion": "2026-04-24", "clave_acceso": "CLAVE-RF"},
        "traslado": {"motivo": "", "ruta": None, "fecha_inicio_traslado": "2026-04-24",
                     "fecha_fin_traslado": "2026-04-24", "placa_vehiculo": "", "placa": "",
                     "transportista_nombre": "", "transportista_ruc": ""},
        "origen": {"direccion": ""},
        "destino": {"direccion": "COLON 516 Y CHIMBORAZO Y BOYACA, GUAYAQUIL, 9"},
        "items": [
            {"codigo": "BINFL.09", "descripcion": "INFLADOR PORTATIL GP-47L PLASTICO MEDIANO REVERSIBLE GIYO (ECO)",
             "cantidad": 10.0, "unidad_medida": "Manual", "referencia": None},
            {"codigo": "BCANA.01", "descripcion": "CANASTILLA BIC.TRINCHE TAIWAN 5/32\" X16",
             "cantidad": 80.0, "unidad_medida": "Manual", "referencia": None},
            {"codigo": "BEJE.25", "descripcion": "EJE POSTERIOR SUPER LARGO C/BOCIN 3/8x200mm TAIWAN",
             "cantidad": 24.0, "unidad_medida": "Manual", "referencia": "PERDIR CO"},
            {"codigo": "BEJE.11", "descripcion": "EJE THOMPSON 35 FIRST TAIWAN",
             "cantidad": 5.0, "unidad_medida": "Manual", "referencia": None},
            {"codigo": "BEJE.15", "descripcion": "EJE THOMPSON 40 FIRST TAIWAN",
             "cantidad": 5.0, "unidad_medida": "Manual", "referencia": None},
            {"codigo": "BTUBO.66", "descripcion": "TUBO 24X1-3/8 A/V DURO TAILANDIA",
             "cantidad": 10.0, "unidad_medida": "Manual", "referencia": None},
        ],
        "observaciones": "1 FUNDA",
    }


# ── Synthetic CONTRACT fixtures (NOT real SAP/RF documents) ─────────────────
#
# Everything above this line is grounded in a real, live-observed document
# (docnum 1007542 / DocEntry 55142). That document is 100% IVA-exempt
# (VatPrcnt=0 on every line), so it cannot exercise a NET/GROSS mapping
# regression (NET == GROSS numerically at 0% tax — see model_adapters.py's
# module docstring and RF-NET-GROSS-PRICE-SOURCE-1). The fixtures below are
# DELIBERATELY SYNTHETIC contract fixtures — not sourced from a live document
# — that exist purely to give the parity gate a case where NET != GROSS, so
# it can actually detect an inversion. Named "contract_*" and documented as
# such; never present these as real SAP/RF payloads.

def contract_invoice_15pct_net_gross_rf() -> dict[str, Any]:
    """Synthetic CONTRACT fixture (NOT a real document) — a single RF raw
    invoice item at 15% IVA where NET != GROSS. Values match the real,
    live-verified 15%-IVA evidence already used for this same regression in
    core/contracts/model_adapters.py's module docstring and
    tests/test_model_adapters.py (INV1.Price=2.26 NET vs
    INV1.PriceAfVAT=2.60 GROSS, confirmed against a live 15%-IVA SSMS query).
    Minimal shape: only ``items`` is populated — adapt_rf_invoice_model
    defaults every other block to {} via its own _dict() fallback, so no
    unrelated business field needs to be fabricated to exercise this check.
    """
    return {
        "items": [
            {"numero": 1, "codigo": "CONTRACT-15PCT-01",
             "descripcion": "Contract fixture item (synthetic, 15% IVA, NOT a real document)",
             "cantidad": 10.0, "precio_unitario": 2.26, "descuento": 0.0,
             "subtotal": 22.60, "precio_total": 22.60,
             "precio_unitario_con_iva": 2.60, "precio_total_con_iva": 26.00,
             "vat_prcnt": 15.0, "referencia": None},
        ],
    }
