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
from core.render.engines.pdf_generator import PdfGenerator  # noqa: E402

_PX_PER_MM = 3.7795  # same constant advanced_engine.py uses for margins/sheet

_NUMS = r"([\d.]+)mm ([\d.]+)mm ([\d.]+)mm ([\d.]+)mm"


def _preview_padding(html):
    m = re.search(r"\.rpt-sheet\{[^}]*padding:" + _NUMS, html)
    return tuple(float(x) for x in m.groups()) if m else None


def _pdf_at_page_margin(html):
    m = re.search(r"@page\{[^}]*margin:" + _NUMS, html)
    return tuple(float(x) for x in m.groups()) if m else None


def _sheet_min_height(html):
    return int(re.search(r"\.rpt-sheet\{[^}]*min-height:(\d+)px", html).group(1))


def _sheet_width(html):
    # Single responsibility: extract the physical .rpt-sheet width (px) —
    # the width counterpart to _sheet_min_height above. Nothing else.
    return int(re.search(r"\.rpt-sheet\{[^}]*width:(\d+)px", html).group(1))


def _preview_only_rpt_page_block(html):
    # The preview-only .rpt-page override is the one rule carrying BOTH
    # width and min-height together (the unconditional base .rpt-page{...}
    # rule, shared by preview and PDF, carries neither as a pair) — order
    # of the two properties inside the block is an implementation detail,
    # not part of the contract, so this matches on presence, not position.
    m = re.search(r"\.rpt-page\{(?=[^}]*width:)(?=[^}]*min-height:)([^}]*)\}", html)
    return m.group(1) if m else None


def _page_content_height(html):
    block = _preview_only_rpt_page_block(html)
    return int(re.search(r"min-height:(\d+)px", block).group(1))


def _page_content_width(html):
    # Single responsibility: extract the PRINTABLE width from the
    # preview-only .rpt-page override.
    block = _preview_only_rpt_page_block(html)
    return int(re.search(r"width:(\d+)px", block).group(1))


def _pdf_page_width(html):
    # Single responsibility: extract the WINNING .rpt-page width from a
    # render() (PDF) document — the base rule and the margin-driven
    # override (PAGE-MARGIN-CONTROL-PARITY-01) both declare .rpt-page{
    # width:...}; the override is emitted later, so the LAST declaration
    # in source order is the one the cascade actually applies.
    widths = re.findall(r"\.rpt-page\{[^}]*width:(\d+)px", html)
    return int(widths[-1])


def _page_inline_width(html):
    # Single responsibility: extract the INLINE style width on the actual
    # <div class="rpt-page" style="width:Npx"> element — a SEPARATE code
    # path from the CSS .rpt-page{width:...} rule above (_page() vs
    # _css()). An inline style always wins over any <style> rule
    # regardless of source order, so these two values can silently
    # diverge if only one of the two call sites is ever updated —
    # exactly the real root cause of PAGE-MARGIN-MODEL-01 (the CSS rule
    # alone was correct, but a real browser still rendered the old,
    # unfixed width because the inline attribute overrode it).
    return int(re.search(r'class="rpt-page" style="width:(\d+)px"', html).group(1))


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


def _layout_no_sections(margins):
    # Single responsibility: an EMPTY layout (no sections/elements), for
    # tests that must isolate padding-driven sheet growth from content-
    # driven growth — a section taller than the (deliberately extreme)
    # clamped content area would ALSO force .rpt-page/.rpt-sheet taller,
    # which is expected/correct (real content can't be silently destroyed)
    # and would contaminate a test whose only job is the padding contract.
    return {
        "name": "m-test-empty", "pageWidth": 671, "pageHeight": 1123,
        "pageSize": "A4", "margins": margins, "sections": [], "elements": [],
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

    def test_sheet_is_a4_regardless_of_margins(self):
        # RF-PREVIEW-MARGINS-2: sheet is a full A4 page; margins live INSIDE it
        # (like PDF @page), so the sheet height is constant.
        a = AdvancedHtmlEngine(_layout({**DEF, "top": 5, "bottom": 5}), DATA).render_preview()
        b = AdvancedHtmlEngine(_layout({**DEF, "top": 60, "bottom": 60}), DATA).render_preview()
        self.assertEqual(_sheet_min_height(a), _sheet_min_height(b))

    def test_sheet_width_is_invariant_under_horizontal_margin_changes(self):
        # RF-PREVIEW-MARGINS-3 / PREVIEW-PDF-PARITY-A4-01: sheet width is
        # fixed to the REAL A4 physical width (210mm, same as the PDF's
        # @page{size:A4}) — NOT the layout's own pageWidth (a separate,
        # content-coordinate concept; see test_sheet_width_equals_real_a4_
        # width_not_layout_page_width below) — exactly like sheet height is
        # fixed (test_sheet_is_a4_regardless_of_margins above). Left/right
        # margins are an inset INSIDE that constant width, never added on
        # top. Single contract: only width invariance, nothing about
        # padding, content box, or element positions.
        cases = [
            {**DEF, "left": 20, "right": 20},
            {**DEF, "left": 20, "right": 80},
            {**DEF, "left": 70, "right": 80},
        ]
        widths = [
            _sheet_width(AdvancedHtmlEngine(_layout(m), DATA).render_preview())
            for m in cases
        ]
        self.assertEqual(len(set(widths)), 1, f"expected one constant width, got {widths}")
        self.assertEqual(widths[0], round(210 * 3.7795))  # true A4 width, not pageWidth=671

    def test_sheet_width_equals_real_a4_width_not_layout_page_width(self):
        # PREVIEW-PDF-PARITY-A4-01, single contract: the shipped invoice
        # layout's pageWidth (671) is a content-coordinate value, NOT the
        # physical page size — .rpt-sheet must be true A4 width (210mm)
        # regardless of it. Uses a layout whose pageWidth is deliberately
        # far from A4 width to prove this isn't a coincidental match.
        html = AdvancedHtmlEngine(_layout(DEF), DATA).render_preview()  # pageWidth=671 from _layout()
        self.assertEqual(_sheet_width(html), round(210 * _PX_PER_MM))
        self.assertNotEqual(_sheet_width(html), 671)

    def test_sheet_height_equals_real_a4_height(self):
        # Vertical counterpart — sheet height must be true A4 height
        # (297mm), matching the PDF's @page{size:A4}.
        html = AdvancedHtmlEngine(_layout(DEF), DATA).render_preview()
        self.assertEqual(_sheet_min_height(html), round(297 * _PX_PER_MM))

    def test_sheet_ratio_matches_a4_ratio(self):
        # Single contract: width/height must match A4's 210/297 ratio
        # within float tolerance — proves the sheet isn't just "some
        # constant size" but a correctly-proportioned A4 rectangle (not
        # Letter's 0.7727 or any other accidental ratio).
        html = AdvancedHtmlEngine(_layout(DEF), DATA).render_preview()
        ratio = _sheet_width(html) / _sheet_min_height(html)
        self.assertAlmostEqual(ratio, 210 / 297, places=3)

    @unittest.skipUnless(PdfGenerator.is_available(), "WeasyPrint not installed")
    def test_preview_sheet_dimensions_match_weasyprint_pdf_page_dimensions(self):
        # Single contract, the strongest form of this parity fix: render
        # the SAME layout through render() (real PDF, via WeasyPrint) and
        # render_preview(), and compare .rpt-sheet's declared px size
        # against WeasyPrint's OWN measured Page.width/height (96dpi CSS
        # px, not pt) for the ACTUAL rendered PDF — not a second assumption
        # about what A4 "should" be.
        import weasyprint
        html_pdf = AdvancedHtmlEngine(_layout(DEF), DATA).render()
        doc = weasyprint.HTML(string=html_pdf, base_url=".").render()
        pdf_page = doc.pages[0]

        html_preview = AdvancedHtmlEngine(_layout(DEF), DATA).render_preview()
        sheet_w = _sheet_width(html_preview)
        sheet_h = _sheet_min_height(html_preview)

        self.assertAlmostEqual(sheet_w, pdf_page.width, delta=1)
        self.assertAlmostEqual(sheet_h, pdf_page.height, delta=1)

    def test_right_margin_reduces_pdf_page_width(self):
        # PAGE-MARGIN-CONTROL-PARITY-01, single contract: right margin was
        # "dead" in the exported PDF too (confirmed via WeasyPrint's own
        # box tree: .rpt-page kept the full pageWidth regardless of right,
        # overflowing the print engine's own already-shrunk content box).
        # This is the PDF-side counterpart of test_right_margin_reduces_
        # printable_width (which only covers preview).
        small_r = AdvancedHtmlEngine(_layout({**DEF, "left": 0, "right": 0}), DATA).render()
        big_r = AdvancedHtmlEngine(_layout({**DEF, "left": 0, "right": 100}), DATA).render()
        self.assertLess(_pdf_page_width(big_r), _pdf_page_width(small_r))

    def test_pdf_page_width_matches_preview_printable_width(self):
        # Single contract: preview and PDF must compute .rpt-page's width
        # with the EXACT same formula/value — the parity this whole phase
        # is about. Before this fix, PDF always used pageWidth
        # unconditionally while preview used pageWidth-left-right: two
        # different formulas for the same concept.
        m = {**DEF, "left": 30, "right": 90}
        preview_w = _page_content_width(AdvancedHtmlEngine(_layout(m), DATA).render_preview())
        pdf_w = _pdf_page_width(AdvancedHtmlEngine(_layout(m), DATA).render())
        self.assertEqual(preview_w, pdf_w)

    @unittest.skipUnless(PdfGenerator.is_available(), "WeasyPrint not installed")
    def test_pdf_content_box_and_rpt_page_agree_on_right_margin(self):
        # Strongest form: WeasyPrint's OWN print content box (from @page's
        # margin, independent of anything advanced_engine.py computes) and
        # .rpt-page's actual rendered width must both reflect the same
        # right margin — proven by rendering the real PDF box tree, not
        # just reading CSS/HTML source text.
        import weasyprint
        m = {**DEF, "left": 0, "right": 100}
        html = AdvancedHtmlEngine(_layout(m), DATA).render()
        doc = weasyprint.HTML(string=html, base_url=".").render()
        page_box = doc.pages[0]._page_box

        def _first_div_width(box):
            for child in getattr(box, "children", []) or []:
                if getattr(child, "element_tag", None) == "div":
                    return child.width
                found = _first_div_width(child)
                if found is not None:
                    return found
            return None

        rpt_page_width = _first_div_width(page_box)
        self.assertIsNotNone(rpt_page_width)
        # .rpt-page must fit within the print engine's own content box —
        # never wider than it (that gap was the "right margin dead" bug).
        self.assertLessEqual(rpt_page_width, page_box.width)

    def test_printable_width_equals_page_width_minus_left_minus_right(self):
        # PAGE-MARGIN-MODEL-01, single contract: printableWidth = pageWidth
        # - marginLeft - marginRight. Nothing about position or the sheet —
        # those have their own dedicated tests. left=40/right=40 stays
        # comfortably positive against this fixture's 671px pageWidth (see
        # test_extreme_margins_clamp_printable_width_to_zero below for the
        # separate over-budget-margins contract).
        m = {**DEF, "left": 40, "right": 40}
        html = AdvancedHtmlEngine(_layout(m), DATA).render_preview()
        l_px, r_px = round(40 * 3.7795), round(40 * 3.7795)
        self.assertEqual(_page_content_width(html), 671 - l_px - r_px)

    def test_inline_page_width_matches_the_printable_width_css_rule(self):
        # Single contract: the two independent code sites that both know
        # about .rpt-page's width (_css()'s CSS rule and _page()'s inline
        # style="width:...") must never diverge. This is the real
        # regression contract for PAGE-MARGIN-MODEL-01: a real browser
        # renders the INLINE value, not the CSS text — a test that only
        # reads CSS text (like test_printable_width_equals_page_width_
        # minus_left_minus_right above) cannot catch the two drifting
        # apart, which is exactly what happened before this fix.
        m = {**DEF, "left": 30, "right": 90}
        html = AdvancedHtmlEngine(_layout(m), DATA).render_preview()
        self.assertEqual(_page_inline_width(html), _page_content_width(html))

    def test_extreme_margins_clamp_printable_width_to_a_small_stable_non_negative_value(self):
        # Single contract: left+right that would mathematically exceed
        # pageWidth must clamp to a small, stable, NEVER-negative width
        # (invalid/unstable rendering). Proportional left/right scaling
        # (see the clamp in _css()) can land at a tiny positive remainder
        # (integer truncation) rather than exactly 0 — the contract is
        # stability and non-negativity, not an exact zero.
        m = {**DEF, "left": 100, "right": 100}  # 200mm of margin vs a 671px-wide test page
        html = AdvancedHtmlEngine(_layout(m), DATA).render_preview()
        width = _page_content_width(html)
        self.assertGreaterEqual(width, 0)
        self.assertLess(width, 10)

    def test_right_margin_reduces_printable_width(self):
        # Single contract: increasing the RIGHT margin alone must shrink the
        # printable width — the regression this whole fix targets ("right
        # margin dead": before PAGE-MARGIN-MODEL-01, .rpt-page's width never
        # depended on margins['right'] at all).
        small_r = AdvancedHtmlEngine(_layout({**DEF, "left": 0, "right": 0}), DATA).render_preview()
        big_r = AdvancedHtmlEngine(_layout({**DEF, "left": 0, "right": 100}), DATA).render_preview()
        self.assertLess(_page_content_width(big_r), _page_content_width(small_r))

    def test_large_left_margin_keeps_printable_area_within_the_fixed_sheet(self):
        # Single contract: reproduces the user-reported case (left=176,
        # right=0) — printableRight (= printableX + printableWidth) must
        # never exceed the sheet's own fixed width. This is the literal
        # "content escapes the physical sheet" bug: before this fix,
        # .rpt-page kept the full page_width regardless of left, so its
        # right edge (l_px + page_width) landed past the sheet's padding
        # box whenever l_px > 0.
        m = {**DEF, "left": 176, "right": 0}
        html = AdvancedHtmlEngine(_layout(m), DATA).render_preview()
        sheet_w = _sheet_width(html)
        l_px = round(176 * 3.7795)
        printable_x = l_px
        printable_width = _page_content_width(html)
        printable_right = printable_x + printable_width
        self.assertLessEqual(printable_right, sheet_w)

    def test_top_margin_reduces_printable_height(self):
        # Single contract, vertical counterpart of
        # test_right_margin_reduces_printable_width: increasing TOP alone
        # (bottom held constant) must shrink the printable height —
        # top and bottom already appear together in page_content_h =
        # page_h - top - bottom, but nothing isolated TOP on its own before.
        small_t = AdvancedHtmlEngine(_layout({**DEF, "top": 5, "bottom": 15}), DATA).render_preview()
        big_t = AdvancedHtmlEngine(_layout({**DEF, "top": 100, "bottom": 15}), DATA).render_preview()
        self.assertLess(_page_content_height(big_t), _page_content_height(small_t))

    def test_extreme_top_bottom_padding_sum_never_exceeds_page_height(self):
        # Single contract, vertical counterpart of
        # test_large_left_margin_keeps_printable_area_within_the_fixed_sheet.
        # This asserts the CLAMP INPUT (the padding-top + padding-bottom
        # values .rpt-sheet actually declares), not the declared min-height
        # text (which was never wrong — sheet_h = self._page_h was already
        # correct before this fix; the bug was that box-sizing:border-box +
        # min-height still lets a real browser render TALLER than that when
        # padding alone exceeds it, verified live via
        # tools/diagnostics/rf-page-margin-model — not something a text-only
        # Python test can observe on its own, hence that tool exists
        # alongside this one). If padding-top+padding-bottom here is
        # correctly bounded, the browser has nothing left to force growth
        # from (confirmed empirically with the diagnostic tool).
        m = {"top": 200, "right": 20, "bottom": 200, "left": 20}  # 400mm vs 1123px pageHeight
        html = AdvancedHtmlEngine(_layout_no_sections(m), DATA).render_preview()
        top_mm, _right_mm, bottom_mm, _left_mm = _preview_padding(html)
        _MM = 3.7795
        self.assertLessEqual(round(top_mm * _MM) + round(bottom_mm * _MM), 1123)

    def test_increasing_bottom_shrinks_content_area(self):
        small_b = AdvancedHtmlEngine(_layout({**DEF, "bottom": 5}), DATA).render_preview()
        big_b = AdvancedHtmlEngine(_layout({**DEF, "bottom": 60}), DATA).render_preview()
        self.assertLess(_page_content_height(big_b), _page_content_height(small_b))

    def test_bottom_zero_gives_largest_content_area(self):
        # bottom=0 -> no bottom inset eaten -> content box is taller
        b0 = AdvancedHtmlEngine(_layout({**DEF, "bottom": 0}), DATA).render_preview()
        b40 = AdvancedHtmlEngine(_layout({**DEF, "bottom": 40}), DATA).render_preview()
        self.assertGreater(_page_content_height(b0), _page_content_height(b40))

    def test_top_change_does_not_alter_bottom_margin(self):
        a = _preview_padding(AdvancedHtmlEngine(_layout({**DEF, "top": 5, "bottom": 20}), DATA).render_preview())
        b = _preview_padding(AdvancedHtmlEngine(_layout({**DEF, "top": 50, "bottom": 20}), DATA).render_preview())
        self.assertEqual(a[2], b[2])  # bottom (index 2) unchanged when top changes

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
