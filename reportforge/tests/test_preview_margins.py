"""RF-PREVIEW-MARGINS-1 — preview renders the layout margins; parity with PDF.

Preview inset comes from a .rpt-sheet wrapper padding (= layout margins), so
elements (positioned relative to their .cr-section inside .rpt-page) are never
shifted. PDF gets the same margins from the @page rule. Both read the SAME
layout.margins, so the values must match by construction.
"""
import re
import sys
import unittest
from pathlib import Path

_PKG = Path(__file__).resolve().parent.parent
_ROOT = _PKG.parent
for _p in (str(_PKG), str(_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from core.render.engines.advanced_engine import AdvancedHtmlEngine  # noqa: E402

_NUMS = r"([\d.]+)mm ([\d.]+)mm ([\d.]+)mm ([\d.]+)mm"


def _preview_padding(html):
    m = re.search(r"\.rpt-sheet\{[^}]*padding:" + _NUMS, html)
    return tuple(float(x) for x in m.groups()) if m else None


def _pdf_at_page_margin(html):
    m = re.search(r"@page\{[^}]*margin:" + _NUMS, html)
    return tuple(float(x) for x in m.groups()) if m else None


def _sheet_min_height(html):
    return int(re.search(r"\.rpt-sheet\{[^}]*min-height:(\d+)px", html).group(1))


def _layout(margins):
    return {
        "name": "m-test",
        "pageWidth": 671,
        "pageSize": "A4",
        "margins": margins,
        "sections": [
            {"id": "s-rh", "stype": "rh", "height": 120},
            {"id": "s-ph", "stype": "ph", "height": 40},
            {"id": "s-det", "stype": "det", "height": 16, "iterates": "items"},
            {"id": "s-pf", "stype": "pf", "height": 40},
            {"id": "s-rf", "stype": "rf", "height": 60},
        ],
        "elements": [
            {"id": "e1", "type": "text", "sectionId": "s-rh", "x": 0, "y": 4,
             "w": 200, "h": 14, "content": "hello"},
        ],
    }


DATA = {"items": [{"c": 1}, {"c": 2}]}
DEF = {"top": 15, "right": 20, "bottom": 15, "left": 20}


class TestPreviewMargins(unittest.TestCase):
    def test_preview_emits_sheet_with_margin_padding(self):
        html = AdvancedHtmlEngine(_layout(DEF), DATA).render_preview()
        self.assertIn("rpt-sheet", html)
        self.assertEqual(_preview_padding(html), (15.0, 20.0, 15.0, 20.0))

    def test_pdf_uses_at_page_margins_and_no_sheet(self):
        html = AdvancedHtmlEngine(_layout(DEF), DATA).render()
        self.assertIn("@page", html)
        self.assertEqual(_pdf_at_page_margin(html), (15.0, 20.0, 15.0, 20.0))
        self.assertNotIn("rpt-sheet", html)  # PDF: no wrapper

    def test_parity_preview_padding_equals_pdf_at_page_margin(self):
        m = {"top": 12, "right": 8, "bottom": 25, "left": 30}
        prev = AdvancedHtmlEngine(_layout(m), DATA).render_preview()
        pdf = AdvancedHtmlEngine(_layout(m), DATA).render()
        self.assertEqual(_preview_padding(prev), _pdf_at_page_margin(pdf))

    def test_increasing_top_increases_sheet_height(self):
        small = AdvancedHtmlEngine(_layout({**DEF, "top": 5}), DATA).render_preview()
        big = AdvancedHtmlEngine(_layout({**DEF, "top": 60}), DATA).render_preview()
        self.assertGreater(_sheet_min_height(big), _sheet_min_height(small))

    def test_per_side_margins_render_distinctly(self):
        m = {"top": 5, "right": 40, "bottom": 5, "left": 10}
        html = AdvancedHtmlEngine(_layout(m), DATA).render_preview()
        self.assertEqual(_preview_padding(html), (5.0, 40.0, 5.0, 10.0))

    def test_zero_margins_no_inset(self):
        m = {"top": 0, "right": 0, "bottom": 0, "left": 0}
        html = AdvancedHtmlEngine(_layout(m), DATA).render_preview()
        self.assertEqual(_preview_padding(html), (0.0, 0.0, 0.0, 0.0))

    def test_element_coords_unchanged_by_margins(self):
        # the element div keeps left:0 / top:4 regardless of margins -> the
        # inset is provided by the wrapper, not by moving elements.
        a = AdvancedHtmlEngine(_layout({**DEF, "left": 0, "top": 0}), DATA).render_preview()
        b = AdvancedHtmlEngine(_layout({**DEF, "left": 40, "top": 40}), DATA).render_preview()
        for html in (a, b):
            self.assertIn("left:0px", html)
            self.assertIn("top:4px", html)


if __name__ == "__main__":
    unittest.main()
