"""Tests for core.contracts.model_adapters.

Single responsibility: verify each source's raw model reshapes into the ONE
canonical model, AND that feeding the adapted output into the normalizers
(factura_normalizer / guia_normalizer) yields full contract coverage — i.e.
both source paths truly converge on the same canonical shape before
normalizing. Runs with synthetic raw models; no SAP, no DB, no I/O.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.contracts.document_contract import (  # noqa: E402
    FACTURA_ROOT_KEYS, FACTURA_ITEM_KEYS, GUIA_ROOT_KEYS, GUIA_ITEM_KEYS,
)
from core.contracts.factura_normalizer import normalize_factura  # noqa: E402
from core.contracts.guia_normalizer import normalize_guia  # noqa: E402
from core.contracts.model_adapters import (  # noqa: E402
    adapt_sap_model,
    adapt_rf_invoice_model,
    adapt_rf_remision_model,
)


def _raw_sap_model() -> dict:
    """Mirrors services/universal_invoice_builder.py::build_invoice_model()."""
    return {
        "meta": {
            "doc_entry": 55142, "doc_num": 1007542, "folio_num": 9501,
            "invoice_number": "000009501", "doc_date": "2026-04-24",
            "doc_total": 106.41, "comments": "1 FUNDA",
        },
        "empresa": {"razon_social": "MI EMPRESA", "ruc": "0999", "direccion": "DIR MATRIZ", "telefono": "07", "correo": "e@e.com"},
        "cliente": {"nombre": "HUANG XIRU", "identificacion": "1311940512001", "direccion": "COLON 516", "telefono": "SN"},
        "fiscal": {
            "ambiente": "PRODUCCION", "tipo_emision": "NORMAL",
            "numero_autorizacion": "AUTHINV", "fecha_autorizacion": "2026-04-24",
            "clave_acceso": "CLAVEINV",
        },
        "pago": {"plazo": "30"},
        "observaciones": None,
        "totales": {"subtotal": 97.57, "iva": 0.0, "total": 97.57, "subtotal_sin_impuestos": 97.57},
        "items": [
            {"codigo": "BINFL.09", "descripcion": "INFLADOR", "cantidad": 10.0,
             "precio_unitario": 2.26, "precio_unitario_con_iva": 2.60, "total": 22.60},
        ],
        "guia_remision": {
            "guide_type": "fve2",
            "numero_guia": "000009501",
            "numero_autorizacion_guia": "AUTHGUIA",
            "motivo": "VENTA",
            "punto_partida": "BODEGA MATRIZ",
            "punto_llegada": "COLON 516 Y CHIMBORAZO",
            "fecha_inicio": "2026-04-24", "fecha_fin": "2026-04-24",
            "transporte": {"codigo": "T1", "placa": "PBX-1234", "descripcion": None},
            "transportista": {"codigo": "TR1", "nombre": "TRANSPORTES SA", "ruc": "0991111111001"},
            "destinatario": {"identificacion": "1311940512001", "razon_social": "HUANG XIRU", "direccion": "COLON 516"},
            "items": [
                {"codigo": "BINFL.09", "descripcion": "INFLADOR", "cantidad": 10.0, "codigo_adicional": "REF-001"},
                {"codigo": "BCANA.01", "descripcion": "CANASTILLA", "cantidad": 80.0, "referencia": "REF-DIRECT-002", "codigo_adicional": "IGNORED"},
                {"codigo": "BEJE.25", "descripcion": "EJE", "cantidad": 24.0},
            ],
        },
    }


def _raw_rf_model() -> dict:
    """Mirrors reportforge/core/models/invoice_model.py::build_invoice_model()."""
    return {
        "meta": {"doc_entry": 1, "doc_num": 9501, "obj_type": "13", "currency": "USD"},
        "empresa": {"razon_social": "MI EMPRESA RF", "ruc": "0999", "direccion_matriz": "DIR RF", "telefono": "07", "correo": "e@e.com"},
        "cliente": {"razon_social": "HUANG XIRU", "nombre": "HUANG XIRU", "identificacion": "1311940512001", "direccion": "COLON 516"},
        "fiscal": {"ambiente": "PRODUCCION", "tipo_emision": "NORMAL", "numero_documento": "000009501",
                   "numero_autorizacion": "AUTHRF", "fecha_autorizacion": "2026-04-24", "clave_acceso": "CLAVERF"},
        "pago": {"forma_pago_fe": "01", "plazo": "30", "total": 106.41},
        "forma_pago": {"descripcion": "SIN UTILIZACION SISTEMA FINANCIERO", "valor": 106.41, "plazo": "30", "tiempo": None},
        "fecha": {"emision": "2026-04-24"},
        "hora": {"emision": "12:40"},
        "guia": {"remision": None},
        "observaciones": "1 FUNDA",
        "nota_numero": "000009501",
        "subtotal": 97.57,
        "descuento": 0.0,
        "valor_total": 106.41,
        "items": [
            # RF-NET-GROSS-PRICE-SOURCE-1: NET != GROSS (a real 15%-IVA pair,
            # matching _raw_sap_model()'s SAME item/document so the
            # cross-source comparison test below stays meaningful) — an
            # all-0%-tax fixture can never catch a NET/GROSS mapping
            # regression since NET and GROSS would be numerically identical.
            {"numero": 1, "codigo": "BINFL.09", "descripcion": "INFLADOR", "cantidad": 10.0,
             "precio_unitario": 2.26, "descuento": 0.0, "subtotal": 22.60, "precio_total": 22.60,
             "precio_unitario_con_iva": 2.60, "precio_total_con_iva": 26.00, "vat_prcnt": 15.0,
             "referencia": None},
        ],
        "totales": {
            "subtotal_15": 0.0, "subtotal_iva_0": 97.57, "subtotal_sin_impuestos": 97.57,
            "subtotal_no_objeto_iva": 0.0, "subtotal_exento_iva": 0.0, "descuento_total": 0.0,
            "valor_ice": 0.0, "iva_15": 0.0, "propina": 0.0, "valor_total": 106.41,
        },
    }


class TestSapAdapterGuiaReferencia(unittest.TestCase):
    """The exact decision this commit makes: referencia = referencia or codigo_adicional."""

    def test_falls_back_to_codigo_adicional_when_no_direct_referencia(self):
        out = adapt_sap_model(_raw_sap_model())
        items = out["guia_remision"]["items"]
        self.assertEqual(items[0]["referencia"], "REF-001")

    def test_direct_referencia_wins_over_codigo_adicional(self):
        out = adapt_sap_model(_raw_sap_model())
        items = out["guia_remision"]["items"]
        self.assertEqual(items[1]["referencia"], "REF-DIRECT-002")

    def test_none_when_neither_source_present(self):
        out = adapt_sap_model(_raw_sap_model())
        items = out["guia_remision"]["items"]
        self.assertIsNone(items[2]["referencia"])


class TestSapAdapterGuiaReshape(unittest.TestCase):
    def test_traslado_fields_reshaped_from_flat_guide_block(self):
        out = adapt_sap_model(_raw_sap_model())
        traslado = out["guia_remision"]["traslado"]
        self.assertEqual(traslado["motivo"], "VENTA")
        self.assertEqual(traslado["placa_vehiculo"], "PBX-1234")
        self.assertEqual(traslado["transportista_nombre"], "TRANSPORTES SA")
        self.assertEqual(traslado["transportista_ruc"], "0991111111001")
        self.assertIsNone(traslado["ruta"])  # documented gap, not fabricated

    def test_fiscal_uses_guide_own_numbers_plus_shared_sri_envelope(self):
        out = adapt_sap_model(_raw_sap_model())
        fiscal = out["guia_remision"]["fiscal"]
        self.assertEqual(fiscal["numero_documento"], "000009501")     # guide's own numero_guia
        self.assertEqual(fiscal["numero_autorizacion"], "AUTHGUIA")   # guide's own auth
        self.assertEqual(fiscal["ambiente"], "PRODUCCION")            # shared invoice fiscal
        self.assertEqual(fiscal["clave_acceso"], "CLAVEINV")          # shared invoice fiscal

    def test_origen_destino_from_punto_partida_llegada(self):
        out = adapt_sap_model(_raw_sap_model())
        self.assertEqual(out["guia_remision"]["origen"]["direccion"], "BODEGA MATRIZ")
        self.assertEqual(out["guia_remision"]["destino"]["direccion"], "COLON 516 Y CHIMBORAZO")


class TestSapAdapterFacturaPassthrough(unittest.TestCase):
    def test_factura_sections_pass_through_unchanged(self):
        raw = _raw_sap_model()
        out = adapt_sap_model(raw)
        self.assertEqual(out["meta"]["invoice_number"], "000009501")
        self.assertEqual(out["meta"]["doc_total"], 106.41)
        self.assertEqual(out["cliente"]["nombre"], "HUANG XIRU")
        self.assertEqual(out["items"][0]["precio_unitario_con_iva"], 2.60)


class TestRfAdapterMetaReshape(unittest.TestCase):
    def test_invoice_number_and_doc_total_lifted_into_meta(self):
        out = adapt_rf_invoice_model(_raw_rf_model())
        self.assertEqual(out["meta"]["invoice_number"], "000009501")
        self.assertEqual(out["meta"]["doc_total"], 106.41)

    def test_flat_observaciones_string_lifted_into_meta_comments(self):
        out = adapt_rf_invoice_model(_raw_rf_model())
        self.assertEqual(out["meta"]["comments"], "1 FUNDA")
        # top-level 'observaciones' must NOT be a bare string (would crash
        # factura_normalizer's dict(model.get("observaciones") or {}))
        self.assertIsNone(out["observaciones"])

    def test_no_guia_remision_key_emitted(self):
        out = adapt_rf_invoice_model(_raw_rf_model())
        self.assertNotIn("guia_remision", out)

    def test_flat_fecha_emision_lifted_into_meta_doc_date(self):
        # RF's raw model keeps emission date under top-level fecha.emision,
        # not meta.doc_date — factura_normalizer only reads meta.doc_date,
        # so without this the rendered FECHA EMISIÓN comes out blank.
        out = adapt_rf_invoice_model(_raw_rf_model())
        self.assertEqual(out["meta"]["doc_date"], "2026-04-24")


class TestRfAdapterItemsNetAndGrossBothReal(unittest.TestCase):
    """RF-NET-GROSS-PRICE-SOURCE-1: both NET and GROSS come from real INV1
    columns (Price/LineTotal vs PriceAfVAT/GTotal) — neither is a formula
    derivation, neither is left as a documented gap."""

    def test_net_and_gross_prices_are_both_real_and_distinct(self):
        out = adapt_rf_invoice_model(_raw_rf_model())
        item = out["items"][0]
        self.assertEqual(item["precio_unitario"], 2.26)
        self.assertEqual(item["subtotal"], 22.60)
        self.assertEqual(item["precio_unitario_con_iva"], 2.60)
        self.assertEqual(item["precio_total_con_iva"], 26.00)
        self.assertNotEqual(item["precio_unitario"], item["precio_unitario_con_iva"])


def _raw_rf_remision_model() -> dict:
    """Mirrors reportforge/core/models/remision_queries.py::fetch_remision_model_data()."""
    return {
        "meta": {"doc_entry": 55142, "doc_num": 1007542, "obj_type": "15", "currency": "USD"},
        "empresa": {"razon_social": "MI EMPRESA RF", "ruc": "0999", "direccion_matriz": "DIR RF",
                    "direccion": "DIR RF", "telefono": "07", "email": "e@e.com", "correo": "e@e.com"},
        "destinatario": {"razon_social": "HUANG XIRU", "identificacion": "1311940512001",
                          "tipo_identificacion": "04", "direccion": "COLON 516"},
        "fiscal": {"ambiente_raw": "1", "ambiente": "PRUEBAS", "tipo_emision": "NORMAL", "emision": "NORMAL",
                   "numero_documento": "000009501", "numero_autorizacion": "AUTHRF",
                   "fecha_autorizacion": "2026-04-24", "clave_acceso": "CLAVERF"},
        "traslado": {"motivo": "VENTA", "ruta": None, "fecha_inicio_traslado": "2026-04-24",
                     "fecha_fin_traslado": "2026-04-24", "placa_vehiculo": "PBX-1234", "placa": "PBX-1234",
                     "transportista_nombre": "TRANSPORTES SA", "transportista_ruc": "0991111111001"},
        "origen": {"direccion": "BODEGA MATRIZ"},
        "destino": {"direccion": "COLON 516 Y CHIMBORAZO"},
        "items": [
            {"codigo": "BINFL.09", "descripcion": "INFLADOR", "cantidad": 10.0,
             "unidad_medida": "UND", "referencia": "REF-001"},
        ],
        "observaciones": "1 FUNDA",
    }


class TestRfRemisionAdapterPassthrough(unittest.TestCase):
    def test_top_level_blocks_pass_through_unchanged(self):
        out = adapt_rf_remision_model(_raw_rf_remision_model())
        self.assertEqual(out["destinatario"]["razon_social"], "HUANG XIRU")
        self.assertEqual(out["traslado"]["motivo"], "VENTA")
        self.assertEqual(out["traslado"]["placa_vehiculo"], "PBX-1234")
        self.assertEqual(out["origen"]["direccion"], "BODEGA MATRIZ")
        self.assertEqual(out["destino"]["direccion"], "COLON 516 Y CHIMBORAZO")
        self.assertEqual(out["fiscal"]["clave_acceso"], "CLAVERF")

    def test_items_already_carry_unidad_medida_and_referencia(self):
        out = adapt_rf_remision_model(_raw_rf_remision_model())
        self.assertEqual(out["items"][0]["unidad_medida"], "UND")
        self.assertEqual(out["items"][0]["referencia"], "REF-001")

    def test_empty_model_does_not_crash(self):
        out = adapt_rf_remision_model({})
        self.assertIsInstance(out, dict)
        self.assertEqual(out["items"], [])

    def test_does_not_mutate_input(self):
        raw = _raw_rf_remision_model()
        before = raw["traslado"].copy()
        adapt_rf_remision_model(raw)
        self.assertEqual(raw["traslado"], before)


class TestAdaptersFeedNormalizersFullCoverage(unittest.TestCase):
    """Both source paths must converge: adapt() -> normalize() covers the contract."""

    def test_sap_path_factura_full_coverage(self):
        payload = normalize_factura(adapt_sap_model(_raw_sap_model()))
        self.assertEqual(FACTURA_ROOT_KEYS - set(payload), set())
        self.assertEqual(FACTURA_ITEM_KEYS - set(payload["items"][0]), set())

    def test_sap_path_guia_full_coverage(self):
        canonical = adapt_sap_model(_raw_sap_model())
        payload = normalize_guia(canonical)
        self.assertEqual(GUIA_ROOT_KEYS - set(payload), set())
        for item in payload["items"]:
            self.assertEqual(GUIA_ITEM_KEYS - set(item), set())

    def test_rf_path_factura_full_coverage(self):
        payload = normalize_factura(adapt_rf_invoice_model(_raw_rf_model()))
        self.assertEqual(FACTURA_ROOT_KEYS - set(payload), set())
        self.assertEqual(FACTURA_ITEM_KEYS - set(payload["items"][0]), set())

    def test_rf_path_guia_full_coverage(self):
        payload = normalize_guia(adapt_rf_remision_model(_raw_rf_remision_model()))
        self.assertEqual(GUIA_ROOT_KEYS - set(payload), set())
        for item in payload["items"]:
            self.assertEqual(GUIA_ITEM_KEYS - set(item), set())

    def test_sap_and_rf_agree_on_shared_values_for_the_same_document(self):
        # Same document (docnum 1007542 / folio 9501) via both sources: the
        # values both paths CAN agree on (client name, invoice display number,
        # gross unit price) must come out identical once normalized.
        sap_payload = normalize_factura(adapt_sap_model(_raw_sap_model()))
        rf_payload = normalize_factura(adapt_rf_invoice_model(_raw_rf_model()))
        self.assertEqual(sap_payload["cliente_razon_social"], rf_payload["cliente_razon_social"])
        self.assertEqual(sap_payload["meta_invoice_number"], rf_payload["meta_invoice_number"])
        self.assertEqual(
            sap_payload["items"][0]["precio_unitario_con_iva"],
            rf_payload["items"][0]["precio_unitario_con_iva"],
        )
        # RF-NET-GROSS-PRICE-SOURCE-1: NET must ALSO agree now — both sources
        # read a real NET column (SAP's DocumentLines[].UnitPrice / RF's
        # INV1.Price), neither is a formula derivation or a documented gap.
        self.assertEqual(
            sap_payload["items"][0]["precio_unitario"],
            rf_payload["items"][0]["precio_unitario"],
        )


class TestPurity(unittest.TestCase):
    def test_adapt_sap_model_does_not_mutate_input(self):
        raw = _raw_sap_model()
        before = raw["guia_remision"]["items"][0].copy()
        adapt_sap_model(raw)
        self.assertEqual(raw["guia_remision"]["items"][0], before)

    def test_adapt_rf_invoice_model_does_not_mutate_input(self):
        raw = _raw_rf_model()
        before = raw["items"][0].copy()
        adapt_rf_invoice_model(raw)
        self.assertEqual(raw["items"][0], before)


class TestEdgeCases(unittest.TestCase):
    def test_sap_model_without_guia_remision_block(self):
        raw = _raw_sap_model()
        del raw["guia_remision"]
        out = adapt_sap_model(raw)
        self.assertNotIn("guia_remision", out)

    def test_empty_models_do_not_crash(self):
        self.assertIsInstance(adapt_sap_model({}), dict)
        self.assertIsInstance(adapt_rf_invoice_model({}), dict)


if __name__ == "__main__":
    unittest.main()
