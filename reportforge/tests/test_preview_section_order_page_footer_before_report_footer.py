"""
test_preview_section_order_page_footer_before_report_footer.py

Contract: AdvancedHtmlEngine.render_preview() must emit the "pf" (Page
Footer) section BEFORE the "rf" (Report Footer) section in the generated
HTML — matching layout.sections' own declared order and the Design
canvas (SectionEngine.js iterates DS.sections in plain array order, no
stype-based reordering). PREVIEW-SECTION-ORDER-PAGE-FOOTER-01.

This is a text-position check on the real generated HTML (fast,
deterministic). Real-browser DOM order is verified separately in
preview_section_order_page_footer_before_report_footer_live_smoke.test.mjs.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.engines.advanced_engine import AdvancedHtmlEngine

_SENTINEL_LAYOUT = {
    "name": "sentinel-order-test", "pageWidth": 754, "pageHeight": 1123, "pageSize": "A4",
    "margins": {"top": 0, "right": 0, "bottom": 0, "left": 0},
    "sections": [
        {"id": "s-rh", "stype": "rh", "label": "Report Header", "height": 20},
        {"id": "s-ph", "stype": "ph", "label": "Page Header", "height": 20},
        {"id": "s-det", "stype": "det", "label": "Detail", "height": 14, "iterates": "items"},
        {"id": "s-pf", "stype": "pf", "label": "Page Footer", "height": 20},
        {"id": "s-rf", "stype": "rf", "label": "Report Footer", "height": 20},
    ],
    "elements": [
        {"id": "e-pf-text", "type": "text", "sectionId": "s-pf", "x": 0, "y": 0, "w": 200, "h": 16,
         "content": "PAGE_FOOTER_SENTINEL", "fontSize": 8},
        {"id": "e-rf-text", "type": "text", "sectionId": "s-rf", "x": 0, "y": 0, "w": 200, "h": 16,
         "content": "REPORT_FOOTER_SENTINEL", "fontSize": 8},
    ],
}
_SENTINEL_DATA = {"items": [{"id": 1}]}


class TestPreviewSectionOrderPageFooterBeforeReportFooter(unittest.TestCase):

    def test_sentinel_layout_page_footer_before_report_footer(self):
        html = AdvancedHtmlEngine(_SENTINEL_LAYOUT, _SENTINEL_DATA).render_preview()
        pf_pos = html.find("PAGE_FOOTER_SENTINEL")
        rf_pos = html.find("REPORT_FOOTER_SENTINEL")
        self.assertGreater(pf_pos, -1, "PAGE_FOOTER_SENTINEL must be present in preview HTML")
        self.assertGreater(rf_pos, -1, "REPORT_FOOTER_SENTINEL must be present in preview HTML")
        self.assertLess(pf_pos, rf_pos, "Page Footer must appear before Report Footer in preview HTML")

    def test_factura_a4_page_footer_section_before_report_footer_section(self):
        layout = json.load(open(ROOT / "reportforge" / "layouts" / "factura_a4.json", encoding="utf-8"))
        data = {"items": [{"codigo": "C001", "descripcion": "x", "cantidad": 1,
                            "precio_unitario": 1.0, "descuento": 0, "subtotal": 1.0}]}
        html = AdvancedHtmlEngine(layout, data).render_preview()
        pf_pos = html.find('data-section-id="s-pf"')
        rf_pos = html.find('data-section-id="s-rf"')
        self.assertGreater(pf_pos, -1)
        self.assertGreater(rf_pos, -1)
        self.assertLess(pf_pos, rf_pos, "s-pf (Pie de pagina) must render before s-rf (Resumen) in preview HTML")

    def test_guia_remision_a4_page_footer_section_before_report_footer_section(self):
        layout = json.load(open(ROOT / "reportforge" / "layouts" / "guia_remision_a4.json", encoding="utf-8"))
        data = {"items": [{"codigo": "C001", "descripcion": "x", "cantidad": 1}]}
        html = AdvancedHtmlEngine(layout, data).render_preview()
        pf_pos = html.find('data-section-id="s-pf"')
        rf_pos = html.find('data-section-id="s-rf"')
        self.assertGreater(pf_pos, -1)
        self.assertGreater(rf_pos, -1)
        self.assertLess(pf_pos, rf_pos, "s-pf must render before s-rf in guia_remision_a4.json preview HTML")

    def test_same_order_holds_for_pdf_render_not_only_preview(self):
        # The section order fix lives in _page(), shared by render() and
        # render_preview() — must not regress the PDF path either.
        layout = json.load(open(ROOT / "reportforge" / "layouts" / "factura_a4.json", encoding="utf-8"))
        data = {"items": [{"codigo": "C001", "descripcion": "x", "cantidad": 1,
                            "precio_unitario": 1.0, "descuento": 0, "subtotal": 1.0}]}
        html = AdvancedHtmlEngine(layout, data).render()
        pf_pos = html.find('data-section-id="s-pf"')
        rf_pos = html.find('data-section-id="s-rf"')
        self.assertLess(pf_pos, rf_pos, "s-pf must render before s-rf in PDF (non-preview) HTML too")


if __name__ == "__main__":
    unittest.main()
