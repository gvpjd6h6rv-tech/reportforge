"""Scan fixes #10.11/#10.12 — regression tests for two GitHub-scan bugs.

BUG 1 (RF-BARCODE-EMPTY-1): a data-bound barcode whose fieldPath resolves
empty/null/missing must NOT emit the internal "RF-BARCODE" placeholder into a
real (fiscal) document. A barcode with a real value still renders.

BUG 2 (RF-GUIA-ITEM-REF-1): the guide A4 adapter
(build_guia_remision_a4_data) must pass item.referencia through to the render
data (it was dropped). Empty/null referencia renders empty without breaking.
"""
import sys
import unittest
from pathlib import Path

# reportforge/ (for `core.` / `scripts.`) and repo root (for `reportforge.`)
_PKG = Path(__file__).resolve().parent.parent
_ROOT = _PKG.parent
for _p in (str(_PKG), str(_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from core.render.engines.advanced_engine import AdvancedHtmlEngine  # noqa: E402
from scripts.operational_docs import build_guia_remision_a4_data  # noqa: E402


def _layout_with_barcode(field_path="fiscal.clave_acceso"):
    return {
        "name": "bc-test",
        "pageWidth": 754,
        "sections": [{"id": "s-rh", "stype": "rh", "height": 200}],
        "elements": [
            {
                "id": "bc",
                "type": "barcode",
                "sectionId": "s-rh",
                "x": 4, "y": 30, "w": 300, "h": 50,
                "fieldPath": field_path,
                "barcodeType": "code128",
            }
        ],
    }


class TestBarcodeEmptySuppression(unittest.TestCase):
    def _render(self, data):
        return AdvancedHtmlEngine(_layout_with_barcode(), data).render()

    def test_empty_value_no_placeholder(self):
        html = self._render({"fiscal": {"clave_acceso": ""}})
        self.assertNotIn("RF-BARCODE", html)
        self.assertIn("cr-barcode-empty", html)

    def test_missing_field_no_placeholder(self):
        # fieldPath present but the data has no such key at all
        html = self._render({})
        self.assertNotIn("RF-BARCODE", html)
        self.assertIn("cr-barcode-empty", html)

    def test_real_value_still_renders_barcode(self):
        html = self._render({"fiscal": {"clave_acceso": "2511202501099012345"}})
        self.assertNotIn("RF-BARCODE", html)
        self.assertNotIn("cr-barcode-empty", html)
        self.assertIn("<svg", html)  # a real barcode SVG was drawn

    def test_explicit_content_allowed(self):
        layout = _layout_with_barcode(field_path="")
        layout["elements"][0]["content"] = "MANUAL-123"
        html = AdvancedHtmlEngine(layout, {}).render()
        self.assertNotIn("RF-BARCODE", html)
        self.assertIn("<svg", html)


class TestGuiaItemReferencia(unittest.TestCase):
    def test_referencia_mapped_when_present(self):
        model = {"guia_remision": {"items": [
            {"codigo": "A1", "descripcion": "Item A", "cantidad": 2,
             "unidad_medida": "UND", "referencia": "REF-9"},
        ]}}
        data = build_guia_remision_a4_data(model)
        self.assertEqual(data["items"][0]["referencia"], "REF-9")

    def test_referencia_falls_back_to_codigo_adicional(self):
        model = {"guia_remision": {"items": [
            {"codigo": "A1", "codigo_adicional": "ALT-7"},
        ]}}
        data = build_guia_remision_a4_data(model)
        self.assertEqual(data["items"][0]["referencia"], "ALT-7")

    def test_missing_referencia_is_empty_not_broken(self):
        model = {"guia_remision": {"items": [
            {"codigo": "A1", "descripcion": "Item A", "cantidad": 1},
        ]}}
        data = build_guia_remision_a4_data(model)
        self.assertIn("referencia", data["items"][0])
        self.assertEqual(data["items"][0]["referencia"], "")
        # table stays intact — other fields still present
        self.assertEqual(data["items"][0]["codigo"], "A1")


if __name__ == "__main__":
    unittest.main()
