"""Tests for core.contracts.guia_normalizer.

Single responsibility: verify the pure model->payload mapping for guía de
remisión — full contract coverage, header/traslado values, and the
item.referencia gap this normalizer closes. Runs with a synthetic canonical
model; no SAP, no DB, no WeasyPrint, no I/O.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.contracts.document_contract import GUIA_ROOT_KEYS, GUIA_ITEM_KEYS  # noqa: E402
from core.contracts.guia_normalizer import normalize_guia  # noqa: E402


def _model() -> dict:
    """Synthetic canonical SAP model, guia_remision block + shared items."""
    return {
        "meta": {"doc_num": 1007542, "doc_entry": 55142},
        "empresa": {"razon_social": "MI EMPRESA", "ruc": "0999", "direccion": "DIR MATRIZ"},
        "observaciones": "1 FUNDA",
        "guia_remision": {
            "destinatario": {"razon_social": "HUANG XIRU", "identificacion": "1311940512001", "direccion": "COLON 516"},
            "origen": {"direccion": "BODEGA MATRIZ"},
            "destino": {"direccion": "COLON 516 Y CHIMBORAZO"},
            "traslado": {
                "motivo": "VENTA", "ruta": "RUTA 1",
                "placa_vehiculo": "PBX-1234",
                "transportista_nombre": "TRANSPORTES SA", "transportista_ruc": "0991111111001",
            },
            "fiscal": {
                "numero_documento": "000009501", "numero_autorizacion": "AUTH123",
                "fecha_autorizacion": "2026-04-24", "ambiente": "PRODUCCION",
                "tipo_emision": "NORMAL", "clave_acceso": "CLAVE123",
            },
            "items": [
                {"codigo": "BINFL.09", "descripcion": "INFLADOR", "cantidad": 10.0,
                 "unidad_medida": "UND", "codigo_adicional": "REF-001"},
                {"codigo": "BCANA.01", "descripcion": "CANASTILLA", "cantidad": 80.0,
                 "unidad_medida": "UND", "referencia": "REF-DIRECT-002"},
            ],
        },
    }


class TestContractCoverage(unittest.TestCase):
    def test_every_root_contract_key_present(self):
        out = normalize_guia(_model())
        missing = GUIA_ROOT_KEYS - set(out)
        self.assertEqual(missing, set(), f"root keys missing from payload: {sorted(missing)}")

    def test_every_item_contract_key_present(self):
        out = normalize_guia(_model())
        self.assertTrue(out["items"])
        for i, item in enumerate(out["items"]):
            missing = GUIA_ITEM_KEYS - set(item)
            self.assertEqual(missing, set(), f"item[{i}] missing: {sorted(missing)}")


class TestReferenciaGap(unittest.TestCase):
    """The gap this normalizer exists to close: item.referencia must not be dropped."""

    def test_referencia_falls_back_to_codigo_adicional(self):
        out = normalize_guia(_model())
        self.assertEqual(out["items"][0]["referencia"], "REF-001")

    def test_referencia_direct_key_wins_over_codigo_adicional(self):
        out = normalize_guia(_model())
        self.assertEqual(out["items"][1]["referencia"], "REF-DIRECT-002")

    def test_referencia_never_missing_key_even_when_absent_in_source(self):
        model = _model()
        del model["guia_remision"]["items"][0]["codigo_adicional"]
        out = normalize_guia(model)
        self.assertIn("referencia", out["items"][0])
        self.assertEqual(out["items"][0]["referencia"], "")

    def test_unidad_medida_present(self):
        out = normalize_guia(_model())
        self.assertEqual(out["items"][0]["unidad_medida"], "UND")


class TestHeaderAndTrasladoValues(unittest.TestCase):
    def test_destinatario_and_empresa(self):
        out = normalize_guia(_model())
        self.assertEqual(out["destinatario_razon_social"], "HUANG XIRU")
        self.assertEqual(out["empresa_razon_social"], "MI EMPRESA")

    def test_traslado_fields(self):
        out = normalize_guia(_model())
        self.assertEqual(out["traslado_motivo"], "VENTA")
        self.assertEqual(out["traslado_placa"], "PBX-1234")
        self.assertEqual(out["traslado_transportista_ruc"], "0991111111001")

    def test_fiscal_and_meta(self):
        out = normalize_guia(_model())
        self.assertEqual(out["fiscal_clave_acceso"], "CLAVE123")
        self.assertEqual(out["meta_doc_num"], "1007542")


class TestEdgeCases(unittest.TestCase):
    def test_empty_model_yields_all_keys_no_crash(self):
        out = normalize_guia({})
        self.assertEqual(GUIA_ROOT_KEYS - set(out), set())
        self.assertEqual(out["items"], [])

    def test_items_fallback_to_root_items_when_no_guia_block_items(self):
        model = {"items": [{"codigo": "X1", "descripcion": "D", "cantidad": 1,
                             "unidad_medida": "UND", "referencia": "R1"}]}
        out = normalize_guia(model)
        self.assertEqual(len(out["items"]), 1)
        self.assertEqual(out["items"][0]["referencia"], "R1")

    def test_pure_no_input_mutation(self):
        model = _model()
        before = model["guia_remision"]["items"][0].copy()
        normalize_guia(model)
        self.assertEqual(model["guia_remision"]["items"][0], before, "normalizer must not mutate input")


if __name__ == "__main__":
    unittest.main()
