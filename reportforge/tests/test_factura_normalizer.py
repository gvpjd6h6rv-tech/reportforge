"""Tests for core.contracts.factura_normalizer.

Single responsibility: verify the pure model->payload mapping — full contract
coverage, FV1 NET values, FV2 GROSS/IVA values, and edge cases. Runs with a
synthetic canonical model; no SAP, no DB, no WeasyPrint, no I/O.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.contracts.document_contract import FACTURA_ROOT_KEYS, FACTURA_ITEM_KEYS  # noqa: E402
from core.contracts.factura_normalizer import normalize_factura  # noqa: E402


def _model() -> dict:
    """Synthetic canonical SAP model mirroring the real nested shape.

    Numbers chosen so the IVA math is checkable:
      line1: qty 10 * gross 2.60 = 26.00   (net 2.26 / 22.60)
      line2: qty  2 * gross 5.75 = 11.50   (net 5.00 / 10.00)
      gross_subtotal = 37.50 ; doc_total = 35.00 ; descuento_display = 2.50
    """
    return {
        "meta": {
            "doc_num": 1007542, "doc_entry": 55142, "folio_num": 9501,
            "invoice_number": "000009501", "doc_date": "2026-04-24",
            "doc_total": 35.00, "comments": "1 FUNDA",
        },
        "empresa": {"razon_social": "MI EMPRESA", "ruc": "0999", "direccion": "DIR MATRIZ", "telefono": "07", "correo": "e@e.com"},
        "cliente": {"nombre": "HUANG XIRU", "identificacion": "1311940512001", "direccion": "COLON 516", "telefono": "SN"},
        "fiscal": {"ambiente": "PRODUCCION", "tipo_emision": "NORMAL", "numero_autorizacion": "AUTH123", "fecha_autorizacion": "2026-04-24"},
        "pago": {"plazo": "30"},
        "observaciones": None,
        "totales": {"subtotal": 32.60, "iva": 0.0, "total": 32.60, "subtotal_sin_impuestos": 32.60},
        "items": [
            {"codigo": "BINFL.09", "descripcion": "INFLADOR", "cantidad": 10.0,
             "precio_unitario": 2.26, "precio_unitario_con_iva": 2.60, "total": 22.60},
            {"codigo": "BCANA.01", "descripcion": "CANASTILLA", "cantidad": 2.0,
             "precio_unitario": 5.00, "precio_unitario_con_iva": 5.75, "total": 10.00},
        ],
    }


class TestContractCoverage(unittest.TestCase):
    def test_every_root_contract_key_present(self):
        out = normalize_factura(_model())
        missing = FACTURA_ROOT_KEYS - set(out)
        self.assertEqual(missing, set(), f"root keys missing from payload: {sorted(missing)}")

    def test_every_item_contract_key_present(self):
        out = normalize_factura(_model())
        self.assertTrue(out["items"])
        for i, item in enumerate(out["items"]):
            missing = FACTURA_ITEM_KEYS - set(item)
            self.assertEqual(missing, set(), f"item[{i}] missing: {sorted(missing)}")


class TestFV1NetValues(unittest.TestCase):
    def test_item_net_price_and_subtotal(self):
        out = normalize_factura(_model())
        self.assertEqual(out["items"][0]["precio_unitario"], 2.26)
        self.assertEqual(out["items"][0]["subtotal"], 22.60)

    def test_totales_net(self):
        out = normalize_factura(_model())
        self.assertEqual(out["totales_valor_total"], 32.60)
        self.assertEqual(out["totales_subtotal_sin_impuestos"], 32.60)

    def test_clave_acceso_reaches_payload_for_the_barcode_element(self):
        model = _model()
        model["fiscal"]["clave_acceso"] = "0705202601091304266900120021010000212061234567810"
        out = normalize_factura(model)
        self.assertEqual(out["fiscal_clave_acceso"], "0705202601091304266900120021010000212061234567810")


class TestFV2GrossIvaValues(unittest.TestCase):
    def test_item_gross_unit_and_line(self):
        out = normalize_factura(_model())
        self.assertEqual(out["items"][0]["precio_unitario_con_iva"], 2.60)
        self.assertEqual(out["items"][0]["precio_total_con_iva"], 26.00)
        self.assertEqual(out["items"][1]["precio_total_con_iva"], 11.50)

    def test_gross_subtotal_and_discount_display(self):
        out = normalize_factura(_model())
        self.assertEqual(out["totales_subtotal_con_iva"], 37.50)      # 26.00 + 11.50
        self.assertEqual(out["totales_descuento_display"], 2.50)      # 37.50 - 35.00

    def test_invoice_number_and_doc_total(self):
        out = normalize_factura(_model())
        self.assertEqual(out["meta_invoice_number"], "000009501")
        self.assertEqual(out["meta_doc_total"], 35.00)

    def test_common_header_values(self):
        out = normalize_factura(_model())
        self.assertEqual(out["cliente_razon_social"], "HUANG XIRU")
        self.assertEqual(out["fecha_emision"], "2026-04-24")


class TestEdgeCases(unittest.TestCase):
    def test_empty_model_yields_all_keys_no_crash(self):
        out = normalize_factura({})
        self.assertEqual(FACTURA_ROOT_KEYS - set(out), set())
        self.assertEqual(out["items"], [])
        self.assertEqual(out["totales_subtotal_con_iva"], 0)
        self.assertEqual(out["totales_descuento_display"], 0)

    def test_item_without_gross_price_is_none_and_excluded_from_sum(self):
        model = _model()
        del model["items"][1]["precio_unitario_con_iva"]
        out = normalize_factura(model)
        self.assertIsNone(out["items"][1]["precio_total_con_iva"])
        # only line1 gross counts
        self.assertEqual(out["totales_subtotal_con_iva"], 26.00)

    def test_pure_no_input_mutation(self):
        model = _model()
        before = model["items"][0].copy()
        normalize_factura(model)
        self.assertEqual(model["items"][0], before, "normalizer must not mutate input")


if __name__ == "__main__":
    unittest.main()
