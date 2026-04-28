"""
test_html_rendering_golden.py — HTML rendering golden snapshot tests.

Pins the exact rendering fingerprint (coordinates, content, structure)
of the default invoice layout with the canonical payload.

Any change to HtmlEngine, default_invoice_layout, or FieldResolver that
affects the rendered output will fail here with a specific diff, not a
silent visual regression discoverable only by opening a PDF.

Run with UPDATE_GOLDEN=1 to regenerate:
    UPDATE_GOLDEN=1 python -m pytest reportforge/tests/test_html_rendering_golden.py

Fingerprint covers:
  - All position:absolute coordinate pairs (element positioning)
  - All <span class="cr-el-inner"> text contents (field resolution)
  - Detail row count (item iteration)
  - Section count and IDs (layout structure)
"""
from __future__ import annotations

import json
import os
import re
import unittest
from pathlib import Path

from reportforge.core.render.engines.html_engine import HtmlEngine
from reportforge.core.render.resolvers.field_resolver import FieldResolver
from reportforge.core.render.resolvers.layout_loader import default_invoice_layout

GOLDEN_PATH = Path(__file__).parent / "golden" / "html_rendering.golden.json"

_PAYLOAD = {
    "meta": {
        "doc_num": "001-001-000000042",
        "doc_type": "FACTURA",
        "fecha_emision": "2024-01-15",
    },
    "empresa": {
        "razon_social": "ACME S.A.",
        "ruc": "0990123456001",
        "direccion_matriz": "Av. Principal 123",
    },
    "cliente": {
        "razon_social": "Cliente Test",
        "identificacion": "0987654321",
        "direccion": "Calle Secundaria 456",
        "email": "test@cliente.com",
    },
    "fiscal": {
        "numero_documento": "001-001-000000042",
        "ambiente": "PRODUCCIÓN",
        "tipo_emision": "NORMAL",
        "fecha_autorizacion": "2024-01-15T10:30:00",
    },
    "items": [
        {
            "codigo": "P001",
            "descripcion": "Producto de prueba",
            "cantidad": 2,
            "precio_unitario": 10.50,
            "descuento": 0.0,
            "subtotal": 21.00,
        }
    ],
    "totales": {
        "subtotal": 21.00,
        "descuento": 0.0,
        "iva_12": 2.52,
        "total": 23.52,
    },
}


def _render_html() -> str:
    resolver = FieldResolver(_PAYLOAD)
    layout = default_invoice_layout()
    return HtmlEngine(layout, resolver).render()


def _fingerprint(html: str) -> dict:
    coords = sorted(set(re.findall(r'left:\d+px;top:\d+px', html)))
    spans = sorted(set(
        s for s in re.findall(r'<span class="cr-el-inner">([^<]*)</span>', html)
        if s.strip()
    ))
    detail_rows = len(re.findall(r'cr-detail-row', html))
    section_count = len(re.findall(r'cr-section', html))
    section_ids = sorted(set(re.findall(r'data-section="([^"]+)"', html)))
    return {
        "coordinates":      coords,
        "span_contents":    spans,
        "detail_row_count": detail_rows,
        "section_count":    section_count,
        "section_ids":      section_ids,
    }


def _load_golden() -> dict:
    with open(GOLDEN_PATH, encoding="utf-8") as f:
        return json.load(f)


class TestHtmlRenderingGolden(unittest.TestCase):
    """Rendered HTML fingerprint must exactly match golden snapshot."""

    @classmethod
    def setUpClass(cls):
        cls.html = _render_html()
        cls.current = _fingerprint(cls.html)
        cls.golden = _load_golden()

        if os.getenv("UPDATE_GOLDEN"):
            updated = dict(cls.golden)
            updated.update(cls.current)
            with open(GOLDEN_PATH, "w", encoding="utf-8") as f:
                json.dump(updated, f, indent=2, ensure_ascii=False)
            print(f"\n[UPDATE_GOLDEN] Wrote {GOLDEN_PATH}")

    def _diff_msg(self, key: str) -> str:
        g = self.golden.get(key)
        c = self.current.get(key)
        added = sorted(set(c) - set(g)) if isinstance(c, list) else None
        removed = sorted(set(g) - set(c)) if isinstance(g, list) else None
        return (
            f"\n{key} changed.\n"
            f"  Added:   {added}\n"
            f"  Removed: {removed}\n"
            f"To accept: UPDATE_GOLDEN=1 python -m pytest {__file__}"
        )

    def test_golden_file_exists(self):
        self.assertTrue(GOLDEN_PATH.exists(), f"Golden file missing: {GOLDEN_PATH}")

    def test_coordinates_match_golden(self):
        self.assertEqual(
            self.current["coordinates"],
            self.golden["coordinates"],
            self._diff_msg("coordinates"),
        )

    def test_span_contents_match_golden(self):
        self.assertEqual(
            self.current["span_contents"],
            self.golden["span_contents"],
            self._diff_msg("span_contents"),
        )

    def test_detail_row_count_matches_golden(self):
        self.assertEqual(
            self.current["detail_row_count"],
            self.golden["detail_row_count"],
            f"detail_row_count changed: golden={self.golden['detail_row_count']} "
            f"current={self.current['detail_row_count']}",
        )

    def test_section_count_matches_golden(self):
        self.assertEqual(
            self.current["section_count"],
            self.golden["section_count"],
            f"section_count changed: golden={self.golden['section_count']} "
            f"current={self.current['section_count']}",
        )

    def test_section_ids_match_golden(self):
        self.assertEqual(
            self.current["section_ids"],
            self.golden["section_ids"],
            self._diff_msg("section_ids"),
        )


class TestHtmlRenderingStructure(unittest.TestCase):
    """HTML output must have required structural properties regardless of golden."""

    @classmethod
    def setUpClass(cls):
        cls.html = _render_html()

    def test_html_is_nonempty_string(self):
        self.assertIsInstance(self.html, str)
        self.assertGreater(len(self.html), 100)

    def test_html_has_doctype(self):
        self.assertTrue(self.html.startswith("<!DOCTYPE html>"))

    def test_html_has_cr_report_wrapper(self):
        self.assertIn('class="cr-report"', self.html)

    def test_html_has_cr_section(self):
        self.assertIn('class="cr-section"', self.html)

    def test_html_has_cr_detail_row(self):
        self.assertIn('cr-detail-row', self.html)

    def test_html_has_absolute_positioning(self):
        self.assertIn("position:absolute", self.html)

    def test_html_has_a4_page_rule(self):
        self.assertIn("size: A4", self.html)

    def test_html_contains_payload_data(self):
        """Key payload values must appear verbatim in the HTML."""
        self.assertIn("001-001-000000042", self.html)
        self.assertIn("ACME S.A.", self.html)
        self.assertIn("Cliente Test", self.html)
        self.assertIn("P001", self.html)

    def test_html_contains_item_field_values(self):
        """Detail section must render item fields."""
        self.assertIn("Producto de prueba", self.html)

    def test_html_detail_row_repeats_per_item(self):
        rows = re.findall(r'cr-detail-row', self.html)
        self.assertGreaterEqual(len(rows), 1)


class TestHtmlRenderingDebugMode(unittest.TestCase):
    """debug=True must not break rendering — just adds outline CSS."""

    def test_debug_mode_renders_without_error(self):
        resolver = FieldResolver(_PAYLOAD, debug=True)
        layout = default_invoice_layout()
        html = HtmlEngine(layout, resolver, debug=True).render()
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn("cr-report", html)

    def test_debug_mode_adds_outline_css(self):
        resolver = FieldResolver(_PAYLOAD)
        layout = default_invoice_layout()
        html = HtmlEngine(layout, resolver, debug=True).render()
        self.assertIn("outline", html)


if __name__ == "__main__":
    unittest.main()
