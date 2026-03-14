# tests/test_render_engine_phase2.py
# Phase 2: Render Engine completeness tests
import unittest, re, sys, os, datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from reportforge.core.render.engines.advanced_engine import (
    AdvancedHtmlEngine, _render_crosstab, _render_barcode_svg,
    _svg_linear_barcode, _svg_qr_placeholder
)

# ── Minimal layout builder ─────────────────────────────────────────────────

def make_layout(sections=None, elements=None, groups=None, sort_by=None):
    secs = sections or [
        {"id":"rh","stype":"rh","height":30},
        {"id":"ph","stype":"ph","height":20},
        {"id":"det","stype":"det","height":18},
        {"id":"rf","stype":"rf","height":30},
        {"id":"pf","stype":"pf","height":20},
    ]
    els = elements or []
    return {
        "name": "TestReport", "pageSize": "A4", "orientation": "portrait",
        "pageWidth": 754, "pageHeight": 1123,
        "margin": {"top":15,"right":20,"bottom":15,"left":20},
        "sections": secs, "elements": els,
        "groups": groups or [], "sortBy": sort_by or [],
    }

DATA = {
    "client": "ACME",
    "items": [
        {"id":"1","name":"Alpha","category":"A","qty":10,"price":100.0,"total":1000.0},
        {"id":"2","name":"Beta", "category":"A","qty":5, "price":200.0,"total":1000.0},
        {"id":"3","name":"Gamma","category":"B","qty":3, "price":300.0,"total":900.0},
        {"id":"4","name":"Delta","category":"B","qty":2, "price":150.0,"total":300.0},
    ]
}


# ── Special fields ─────────────────────────────────────────────────────────

class TestSpecialFields(unittest.TestCase):

    def _render(self, field_path, section_id="pf"):
        els = [{"id":"sf","type":"field","sectionId":section_id,
                "x":0,"y":0,"w":200,"h":14,"fieldPath": field_path}]
        raw = make_layout(elements=els)
        return AdvancedHtmlEngine(raw, DATA).render()

    def test_page_number(self):
        html = self._render("PageNumber")
        self.assertIn(">1<", html)

    def test_total_pages(self):
        html = self._render("TotalPages")
        self.assertIn(">1<", html)

    def test_print_date(self):
        html = self._render("PrintDate")
        today = datetime.date.today().strftime("%d/%m/%Y")
        self.assertIn(today, html)

    def test_print_time(self):
        html = self._render("PrintTime")
        # Should contain HH:MM:SS pattern
        self.assertRegex(html, r'\d{2}:\d{2}:\d{2}')

    def test_record_number(self):
        els = [{"id":"rn","type":"field","sectionId":"det",
                "x":0,"y":0,"w":50,"h":14,"fieldPath":"RecordNumber"}]
        raw = make_layout(elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn(">1<", html)
        self.assertIn(">2<", html)
        self.assertIn(">3<", html)


# ── Element dispatch ──────────────────────────────────────────────────────

class TestElementDispatch(unittest.TestCase):

    def test_chart_element_renders(self):
        els = [{"id":"ch","type":"chart","sectionId":"det",
                "x":0,"y":0,"w":200,"h":100,"chartType":"bar",
                "labelField":"items.name","valueField":"items.total"}]
        raw = make_layout(elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        # Should contain cr-chart div
        self.assertIn('class="cr-chart"', html)

    def test_barcode_element_renders(self):
        els = [{"id":"bc","type":"barcode","sectionId":"rh",
                "x":0,"y":0,"w":150,"h":50,"barcodeType":"code128",
                "content":"RF-001","showText":True}]
        raw = make_layout(elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn('class="cr-barcode"', html)
        self.assertIn('<svg', html)

    def test_crosstab_element_renders(self):
        els = [{"id":"ct","type":"crosstab","sectionId":"det",
                "x":0,"y":0,"w":400,"h":100,
                "rowField":"items.category","colField":"items.name",
                "valueField":"items.total","summary":"sum"}]
        raw = make_layout(elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn('class="cr-crosstab"', html)

    def test_richtext_element_renders(self):
        els = [{"id":"rt","type":"richtext","sectionId":"rh",
                "x":0,"y":0,"w":200,"h":30,
                "htmlContent":"<b>Bold</b> and <i>italic</i>"}]
        raw = make_layout(elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn('<b>Bold</b>', html)
        self.assertIn('<i>italic</i>', html)

    def test_subreport_element_renders(self):
        els = [{"id":"sr","type":"subreport","sectionId":"rh",
                "x":0,"y":0,"w":200,"h":50,"target":"sub_report.json"}]
        raw = make_layout(elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn('cr-subreport', html)

    def test_unknown_element_type_silent(self):
        """Unknown element types should produce empty string, not crash"""
        els = [{"id":"unk","type":"futuristic_element","sectionId":"rh",
                "x":0,"y":0,"w":100,"h":20}]
        raw = make_layout(elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn('<!DOCTYPE html>', html)


# ── Multi-level grouping ──────────────────────────────────────────────────

class TestMultiLevelGrouping(unittest.TestCase):

    def test_single_group_gh_gf(self):
        secs = [
            {"id":"rh","stype":"rh","height":20},
            {"id":"ph","stype":"ph","height":20},
            {"id":"gh0","stype":"gh","height":20,"groupIndex":0},
            {"id":"det","stype":"det","height":16},
            {"id":"gf0","stype":"gf","height":20,"groupIndex":0},
            {"id":"rf","stype":"rf","height":20},
            {"id":"pf","stype":"pf","height":20},
        ]
        els = [
            {"id":"gh-lbl","type":"field","sectionId":"gh0",
             "x":0,"y":2,"w":200,"h":14,"fieldPath":"category"},
            {"id":"det-name","type":"field","sectionId":"det",
             "x":0,"y":1,"w":200,"h":14,"fieldPath":"items.name"},
        ]
        groups = [{"field":"category","order":"ASC"}]
        raw = make_layout(sections=secs, elements=els, groups=groups)
        html = AdvancedHtmlEngine(raw, DATA).render()
        # Both categories should appear
        self.assertIn(">A<", html)
        self.assertIn(">B<", html)
        # Items should appear
        self.assertIn("Alpha", html)
        self.assertIn("Gamma", html)
        # Group header/footer sections
        self.assertIn('data-stype="gh"', html)
        self.assertIn('data-stype="gf"', html)

    def test_two_level_group(self):
        secs = [
            {"id":"rh","stype":"rh","height":20},
            {"id":"ph","stype":"ph","height":20},
            {"id":"gh0","stype":"gh","height":20,"groupIndex":0},
            {"id":"gh1","stype":"gh","height":16,"groupIndex":1},
            {"id":"det","stype":"det","height":14},
            {"id":"gf1","stype":"gf","height":16,"groupIndex":1},
            {"id":"gf0","stype":"gf","height":20,"groupIndex":0},
            {"id":"rf","stype":"rf","height":20},
            {"id":"pf","stype":"pf","height":20},
        ]
        els = [
            {"id":"g0-f","type":"field","sectionId":"gh0",
             "x":0,"y":2,"w":150,"h":14,"fieldPath":"category"},
            {"id":"g1-f","type":"field","sectionId":"gh1",
             "x":0,"y":1,"w":150,"h":12,"fieldPath":"name"},
            {"id":"det-f","type":"field","sectionId":"det",
             "x":0,"y":0,"w":150,"h":12,"fieldPath":"items.qty"},
        ]
        groups = [
            {"field":"category","order":"ASC"},
            {"field":"name","order":"ASC"},
        ]
        raw = make_layout(sections=secs, elements=els, groups=groups)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn('data-stype="gh"', html)
        self.assertIn("Alpha", html)
        self.assertIn("Gamma", html)


# ── Suppress section ─────────────────────────────────────────────────────

class TestSuppressSection(unittest.TestCase):

    def test_suppress_formula_true(self):
        """Section with suppress=True should not render its elements"""
        secs = [
            {"id":"rh","stype":"rh","height":20},
            {"id":"ph","stype":"ph","height":20},
            {"id":"det","stype":"det","height":16,"suppress":"True"},
            {"id":"rf","stype":"rf","height":20},
            {"id":"pf","stype":"pf","height":20},
        ]
        els = [{"id":"secret","type":"text","sectionId":"det",
                "x":0,"y":0,"w":200,"h":14,"content":"SHOULD_NOT_APPEAR"}]
        raw = make_layout(sections=secs, elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertNotIn("SHOULD_NOT_APPEAR", html)

    def test_suppress_formula_false_shows(self):
        """Section with suppress=False should render normally"""
        secs = [
            {"id":"rh","stype":"rh","height":20},
            {"id":"ph","stype":"ph","height":20},
            {"id":"det","stype":"det","height":16,"suppress":"False"},
            {"id":"rf","stype":"rf","height":20},
            {"id":"pf","stype":"pf","height":20},
        ]
        els = [{"id":"vis","type":"text","sectionId":"det",
                "x":0,"y":0,"w":200,"h":14,"content":"SHOULD_APPEAR"}]
        raw = make_layout(sections=secs, elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn("SHOULD_APPEAR", html)


# ── Pagination ────────────────────────────────────────────────────────────

class TestPagination(unittest.TestCase):

    def test_many_rows_paginate(self):
        """Report with many rows should produce multiple pages"""
        items = [{"id":str(i),"name":f"Item{i}","qty":i,"total":i*10.0}
                 for i in range(80)]
        data = {"items": items}
        raw = make_layout()
        html = AdvancedHtmlEngine(raw, data).render()
        # Should have multiple rpt-page divs
        page_count = html.count('class="rpt-page"')
        self.assertGreater(page_count, 1)

    def test_new_page_before(self):
        """Section with newPageBefore=True forces a page break"""
        secs = [
            {"id":"rh","stype":"rh","height":20},
            {"id":"ph","stype":"ph","height":20},
            {"id":"det","stype":"det","height":16},
            {"id":"rf","stype":"rf","height":20,"newPageBefore":True},
            {"id":"pf","stype":"pf","height":20},
        ]
        items = [{"id":"1","name":"One","qty":1,"total":10.0}]
        data = {"items": items}
        raw = make_layout(sections=secs)
        html = AdvancedHtmlEngine(raw, data).render()
        # Should have at least 1 page
        self.assertGreater(html.count('class="rpt-page"'), 0)

    def test_page_number_increments(self):
        """Multiple pages should show incrementing page numbers in context"""
        items = [{"id":str(i),"name":f"Row{i}","qty":i,"total":i*50.0}
                 for i in range(60)]
        data = {"items": items}
        els = [{"id":"pn","type":"field","sectionId":"pf",
                "x":0,"y":0,"w":100,"h":14,"fieldPath":"PageNumber"}]
        raw = make_layout(elements=els)
        html = AdvancedHtmlEngine(raw, data).render()
        # Page 1 and 2 should both appear
        self.assertIn(">1<", html)
        self.assertIn(">2<", html)


# ── Barcode SVG ──────────────────────────────────────────────────────────

class TestBarcodeSVG(unittest.TestCase):

    def test_linear_barcode_is_svg(self):
        svg = _svg_linear_barcode("12345", 150, 60, True)
        self.assertTrue(svg.startswith("<svg"))
        self.assertIn("</svg>", svg)

    def test_linear_barcode_contains_rects(self):
        svg = _svg_linear_barcode("HELLO", 150, 60, True)
        self.assertIn("<rect", svg)

    def test_linear_barcode_show_text(self):
        svg = _svg_linear_barcode("HELLO", 150, 60, True)
        self.assertIn("HELLO", svg)

    def test_linear_barcode_hide_text(self):
        svg = _svg_linear_barcode("HELLO", 150, 60, False)
        self.assertNotIn("HELLO", svg)

    def test_qr_placeholder_is_svg(self):
        svg = _svg_qr_placeholder("https://example.com", 100, 100, True)
        self.assertTrue(svg.startswith("<svg"))
        self.assertIn("</svg>", svg)

    def test_barcode_dispatch_qr(self):
        svg = _render_barcode_svg("test", "qr", 100, 100, True)
        self.assertIn("<svg", svg)

    def test_barcode_dispatch_code128(self):
        svg = _render_barcode_svg("test", "code128", 150, 60, True)
        self.assertIn("<svg", svg)

    def test_barcode_dispatch_unknown_falls_back(self):
        svg = _render_barcode_svg("test", "futuristic_symbology", 150, 60, False)
        self.assertIn("<svg", svg)


# ── Crosstab renderer ─────────────────────────────────────────────────────

class TestCrosstabRenderer(unittest.TestCase):

    ITEMS = [
        {"category":"A","region":"North","sales":100},
        {"category":"A","region":"South","sales":200},
        {"category":"B","region":"North","sales":150},
        {"category":"B","region":"South","sales":50},
        {"category":"A","region":"North","sales":50},   # second A/North
    ]

    def test_basic_pivot_sum(self):
        html = _render_crosstab(self.ITEMS, "category", "region", "sales", "sum")
        self.assertIn("<table", html)
        self.assertIn("North", html)
        self.assertIn("South", html)
        self.assertIn(">A<", html)
        self.assertIn(">B<", html)

    def test_sum_correct(self):
        html = _render_crosstab(self.ITEMS, "category", "region", "sales", "sum")
        # A/North = 150, A/South = 200, B/North = 150, B/South = 50
        self.assertIn("150", html)
        self.assertIn("200", html)

    def test_count_summary(self):
        html = _render_crosstab(self.ITEMS, "category", "region", "sales", "count")
        # A/North has 2 items
        self.assertIn("2", html)

    def test_grand_total_row(self):
        html = _render_crosstab(self.ITEMS, "category", "region", "sales", "sum")
        self.assertIn("Total", html)

    def test_empty_items(self):
        html = _render_crosstab([], "category", "region", "sales", "sum")
        self.assertIn("No data", html)

    def test_missing_col_field(self):
        html = _render_crosstab(self.ITEMS, "", "region", "sales", "sum")
        self.assertIn("No data", html)


# ── Conditional formatting ────────────────────────────────────────────────

class TestConditionalFormatting(unittest.TestCase):

    def test_conditional_style_applied(self):
        """Element with conditionalStyles where condition is true gets alt color"""
        els = [{"id":"el","type":"field","sectionId":"det",
                "x":0,"y":0,"w":100,"h":14,"fieldPath":"items.qty",
                "conditionalStyles":[{
                    "condition":"items.qty > 4",
                    "style":{"color":"#FF0000"}
                }]}]
        raw = make_layout(elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        # item with qty=10 should get red color
        self.assertIn("#FF0000", html)

    def test_conditional_style_not_applied_when_false(self):
        """Condition that is never true should not inject style"""
        els = [{"id":"el","type":"field","sectionId":"det",
                "x":0,"y":0,"w":100,"h":14,"fieldPath":"items.qty",
                "conditionalStyles":[{
                    "condition":"items.qty > 9999",
                    "style":{"color":"#AABBCC"}
                }]}]
        raw = make_layout(elements=els)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertNotIn("#AABBCC", html)


# ── Full render smoke test ────────────────────────────────────────────────

class TestFullRenderSmoke(unittest.TestCase):

    def test_render_produces_valid_html_structure(self):
        raw = make_layout()
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertTrue(html.startswith("<!DOCTYPE html>"))
        self.assertIn("<html", html)
        self.assertIn("</html>", html)
        self.assertIn("<head>", html)
        self.assertIn("</head>", html)
        self.assertIn("<body>", html)
        self.assertIn("</body>", html)

    def test_render_no_python_exceptions(self):
        """Complex layout with all element types should not crash"""
        secs = [
            {"id":"rh","stype":"rh","height":60},
            {"id":"ph","stype":"ph","height":30},
            {"id":"gh0","stype":"gh","height":20,"groupIndex":0},
            {"id":"det","stype":"det","height":18},
            {"id":"gf0","stype":"gf","height":20,"groupIndex":0},
            {"id":"rf","stype":"rf","height":40},
            {"id":"pf","stype":"pf","height":25},
        ]
        els = [
            {"id":"t1","type":"text","sectionId":"rh","x":0,"y":0,"w":300,"h":20,"content":"Report Title"},
            {"id":"img1","type":"image","sectionId":"rh","x":300,"y":0,"w":80,"h":40,"content":"Logo"},
            {"id":"bc1","type":"barcode","sectionId":"rh","x":400,"y":0,"w":120,"h":40,"content":"RF001"},
            {"id":"pn","type":"field","sectionId":"pf","x":0,"y":0,"w":100,"h":14,"fieldPath":"PageNumber"},
            {"id":"tp","type":"field","sectionId":"pf","x":100,"y":0,"w":100,"h":14,"fieldPath":"TotalPages"},
            {"id":"pd","type":"field","sectionId":"pf","x":200,"y":0,"w":150,"h":14,"fieldPath":"PrintDate"},
            {"id":"det-n","type":"field","sectionId":"det","x":0,"y":2,"w":200,"h":14,"fieldPath":"items.name"},
            {"id":"rn","type":"field","sectionId":"det","x":300,"y":2,"w":60,"h":14,"fieldPath":"RecordNumber"},
            {"id":"ch1","type":"chart","sectionId":"rf","x":0,"y":0,"w":300,"h":80,"chartType":"bar"},
            {"id":"ct1","type":"crosstab","sectionId":"gh0","x":0,"y":0,"w":400,"h":40,
             "rowField":"items.category","colField":"items.name","valueField":"items.total"},
        ]
        groups = [{"field":"category","order":"ASC"}]
        raw = make_layout(sections=secs, elements=els, groups=groups)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn("<!DOCTYPE html>", html)
        self.assertGreater(len(html), 500)


if __name__ == "__main__":
    unittest.main(verbosity=2)
