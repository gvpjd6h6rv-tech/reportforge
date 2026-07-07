"""RF-GEOMETRY-UNIFY-1 — Preview and PDF must paginate identically.

Both /designer-preview (render_preview) and /render (render) go through the
SAME AdvancedHtmlEngine._pages(), driven by the layout's page geometry
(page_h, margins). This test locks that the page-1 cut (and page count) is
identical, and that the margin metamorphics behave (bigger bottom/top margin
never grows page-1 row capacity). The historical bug was a CLIENT-side preview
page height (671*sqrt2 = 949 vs server 1123) clipping the last page-1 row.
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


def _layout(margins=None):
    return {
        "name": "pag", "pageWidth": 671, "pageSize": "A4",
        "margins": margins or {"top": 15, "right": 20, "bottom": 15, "left": 20},
        "sections": [
            {"id": "s-rh", "stype": "rh", "height": 400},
            {"id": "s-ph", "stype": "ph", "height": 30},
            {"id": "s-det", "stype": "det", "height": 14, "iterates": "items"},
            {"id": "s-pf", "stype": "pf", "height": 6},
            {"id": "s-rf", "stype": "rf", "height": 246},
        ],
        "elements": [],
    }


DATA = {"items": [{"codigo": f"IT{i:03d}"} for i in range(60)]}


def _page1_rows(html):
    p1 = re.split(r'<div class="rpt-page', html)[1]
    return re.findall(r'data-row="(\d+)"', p1)


def _page_count(html):
    return html.count('class="rpt-page"')


def _per_page_rows(html):
    # one list of detail data-row ids per rendered .rpt-page, in order
    parts = re.split(r'<div class="rpt-page', html)[1:]
    return [re.findall(r'data-row="(\d+)"', p) for p in parts]


class TestPreviewPdfPaginationParity(unittest.TestCase):
    def test_preview_and_pdf_page1_cut_identical(self):
        eng = lambda: AdvancedHtmlEngine(_layout(), DATA)
        prev = _page1_rows(eng().render_preview())
        pdf = _page1_rows(eng().render())
        self.assertEqual(prev, pdf)
        self.assertTrue(prev, "expected detail rows on page 1")

    def test_preview_and_pdf_same_page_count(self):
        self.assertEqual(_page_count(AdvancedHtmlEngine(_layout(), DATA).render_preview()),
                         _page_count(AdvancedHtmlEngine(_layout(), DATA).render()))

    def test_bigger_bottom_margin_never_grows_page1(self):
        base = len(_page1_rows(AdvancedHtmlEngine(_layout({"top": 15, "right": 20, "bottom": 15, "left": 20}), DATA).render_preview()))
        big = len(_page1_rows(AdvancedHtmlEngine(_layout({"top": 15, "right": 20, "bottom": 60, "left": 20}), DATA).render_preview()))
        self.assertLessEqual(big, base)

    def test_bigger_top_margin_never_grows_page1(self):
        base = len(_page1_rows(AdvancedHtmlEngine(_layout({"top": 15, "right": 20, "bottom": 15, "left": 20}), DATA).render_preview()))
        big = len(_page1_rows(AdvancedHtmlEngine(_layout({"top": 60, "right": 20, "bottom": 15, "left": 20}), DATA).render_preview()))
        self.assertLessEqual(big, base)

    def test_horizontal_margins_do_not_change_vertical_pagination(self):
        rows_a = _page1_rows(AdvancedHtmlEngine(_layout({"top": 15, "right": 5, "bottom": 15, "left": 5}), DATA).render_preview())
        rows_b = _page1_rows(AdvancedHtmlEngine(_layout({"top": 15, "right": 60, "bottom": 15, "left": 60}), DATA).render_preview())
        self.assertEqual(rows_a, rows_b)

    def test_long_doc_preview_equals_pdf_per_page(self):
        # N-page safety: a >=5-page document must cut IDENTICALLY on every page
        # (not just page 1/2) in preview and PDF -> per-page hit-layer alignment
        # has a matching render page for every page.
        data = {"items": [{"codigo": f"IT{i:04d}"} for i in range(350)]}
        prev = _per_page_rows(AdvancedHtmlEngine(_layout(), data).render_preview())
        pdf = _per_page_rows(AdvancedHtmlEngine(_layout(), data).render())
        self.assertGreaterEqual(len(prev), 5)
        self.assertEqual(prev, pdf)  # same page count AND same rows on each page

    def test_doubling_rows_keeps_alignment_contract(self):
        # metamorphic: doubling the data doubles pages without desyncing preview
        # vs PDF (no accumulated drift across many pages).
        for n in (120, 240, 480):
            data = {"items": [{"codigo": f"IT{i:04d}"} for i in range(n)]}
            prev = _per_page_rows(AdvancedHtmlEngine(_layout(), data).render_preview())
            pdf = _per_page_rows(AdvancedHtmlEngine(_layout(), data).render())
            self.assertEqual(prev, pdf, f"desync at {n} rows")

    def test_explicit_pageheight_is_honored(self):
        # a layout that DOES bring pageHeight overrides the 1123 default
        lay = _layout()
        lay["pageHeight"] = 700
        short = _page1_rows(AdvancedHtmlEngine(lay, DATA).render_preview())
        tall = _page1_rows(AdvancedHtmlEngine(_layout(), DATA).render_preview())  # default 1123
        self.assertLess(len(short), len(tall))


if __name__ == "__main__":
    unittest.main()
