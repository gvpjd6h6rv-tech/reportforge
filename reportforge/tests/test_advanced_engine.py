# tests/test_advanced_engine.py
# ─────────────────────────────────────────────────────────────────
# Complete test suite for ReportForge advanced engine.
# Runs without SAP, WeasyPrint, or any external dependencies.
# ─────────────────────────────────────────────────────────────────
import json, sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.render.expressions.aggregator  import Aggregator
from core.render.expressions.evaluator   import ExpressionEvaluator, _coerce_str, _safe_eval
try:
    from core.render.expressions.evaluator import _safe_eval_ast
except ImportError:
    def _safe_eval_ast(expr):
        try: return _safe_eval(expr)
        except: return str(expr)
from core.render.pipeline.normalizer     import normalize_layout
from core.render.resolvers.layout_loader import layout_from_dict, Layout, Section, Element
from core.render.resolvers.field_resolver import FieldResolver, format_value as _format_value
from core.render.engines.advanced_engine  import AdvancedHtmlEngine, render_advanced


# ── Shared fixtures ───────────────────────────────────────────────
ITEMS = [
    {"code":"A001","name":"Laptop",      "category":"Electronics","qty":5, "unit_price":999.99,"discount":0.05,"total":4749.95,"stock":12},
    {"code":"A002","name":"Mouse",        "category":"Electronics","qty":20,"unit_price":29.99, "discount":0.10,"total":539.82, "stock":3},
    {"code":"B001","name":"Desk Chair",   "category":"Furniture",  "qty":3, "unit_price":299.99,"discount":0.0, "total":899.97, "stock":6},
    {"code":"B002","name":"Standing Desk","category":"Furniture",  "qty":2, "unit_price":699.99,"discount":0.15,"total":1189.98,"stock":2},
    {"code":"C001","name":"Office Suite", "category":"Software",   "qty":10,"unit_price":199.99,"discount":0.20,"total":1599.92,"stock":999},
]

DATA = {
    "period":    "Q4 2025",
    "report_date": "19/11/2025",
    "client":    {"name":"ACME Corp","id":"RUC-001"},
    "company":   {"name":"Tech Distributor S.A.","ruc":"0991234567001"},
    "items":     ITEMS,
}

def minimal_layout_raw(extra_sections=None, extra_elements=None, extra_els=None) -> dict:
    extra_elements = extra_elements or extra_els
    secs = [
        {"id":"s-rh","stype":"rh","label":"Report Header","height":60},
        {"id":"s-ph","stype":"ph","label":"Page Header",  "height":40},
        {"id":"s-dt","stype":"det","label":"Detail",      "height":16,"iterates":"items"},
        {"id":"s-pf","stype":"pf","label":"Page Footer",  "height":30},
        {"id":"s-rf","stype":"rf","label":"Report Footer","height":40},
    ] + (extra_sections or [])
    els = [
        {"id":"rh-1","type":"text","sectionId":"s-rh","x":4,"y":4,"w":400,"h":16,
         "content":"Report: {period}","fontSize":12,"bold":True},
        {"id":"ph-1","type":"text","sectionId":"s-ph","x":4,"y":4,"w":200,"h":14,
         "content":"Client: {client.name}","fontSize":8},
        {"id":"dt-code","type":"field","sectionId":"s-dt","x":4,"y":1,"w":80,"h":14,
         "fieldPath":"item.code","fontSize":8},
        {"id":"dt-name","type":"field","sectionId":"s-dt","x":88,"y":1,"w":200,"h":14,
         "fieldPath":"item.name","fontSize":8},
        {"id":"dt-qty","type":"field","sectionId":"s-dt","x":292,"y":1,"w":50,"h":14,
         "fieldPath":"item.qty","fieldFmt":"int","fontSize":8,"align":"right"},
        {"id":"dt-price","type":"field","sectionId":"s-dt","x":346,"y":1,"w":80,"h":14,
         "fieldPath":"item.unit_price","fieldFmt":"currency","fontSize":8,"align":"right"},
        {"id":"dt-total","type":"field","sectionId":"s-dt","x":430,"y":1,"w":90,"h":14,
         "fieldPath":"item.qty * item.unit_price","fieldFmt":"currency","fontSize":8,
         "align":"right","bold":True},
        {"id":"pf-1","type":"text","sectionId":"s-pf","x":4,"y":8,"w":300,"h":12,
         "content":"ReportForge","fontSize":7},
        {"id":"rf-total","type":"field","sectionId":"s-rf","x":430,"y":14,"w":90,"h":14,
         "fieldPath":"sum(items.total)","fieldFmt":"currency","fontSize":10,"bold":True,"align":"right"},
        {"id":"rf-cnt","type":"field","sectionId":"s-rf","x":4,"y":14,"w":200,"h":14,
         "fieldPath":"count(items)","fieldFmt":"int","fontSize":8},
    ] + (extra_elements or [])
    return {"name":"Test Report","pageSize":"A4","pageWidth":754,"sections":secs,"elements":els}


# ═════════════════════════════════════════════════════════════════
class TestAggregator(unittest.TestCase):

    def setUp(self):
        self.ag = Aggregator(ITEMS)

    def test_sum(self):
        self.assertAlmostEqual(self.ag.sum("items.total"), sum(it["total"] for it in ITEMS))

    def test_sum_unit_price(self):
        self.assertAlmostEqual(self.ag.sum("items.unit_price"), 2229.95)

    def test_count_all(self):
        self.assertEqual(self.ag.count("items"), 5)

    def test_count_field(self):
        self.assertEqual(self.ag.count("items.code"), 5)

    def test_avg(self):
        expected = sum(it["total"] for it in ITEMS) / 5
        self.assertAlmostEqual(self.ag.avg("items.total"), expected)

    def test_min(self):
        self.assertAlmostEqual(self.ag.min("items.unit_price"), 29.99)

    def test_max(self):
        self.assertAlmostEqual(self.ag.max("items.unit_price"), 999.99)

    def test_first(self):
        self.assertEqual(self.ag.first("items.name"), "Laptop")

    def test_last(self):
        self.assertEqual(self.ag.last("items.name"), "Office Suite")

    def test_group_sum(self):
        elec = [it for it in ITEMS if it["category"] == "Electronics"]
        s = self.ag.group_sum(elec, "total")
        self.assertAlmostEqual(s, ITEMS[0]["total"] + ITEMS[1]["total"])

    def test_group_count(self):
        furn = [it for it in ITEMS if it["category"] == "Furniture"]
        self.assertEqual(self.ag.group_count(furn), 2)

    def test_group_avg(self):
        soft = [it for it in ITEMS if it["category"] == "Software"]
        self.assertAlmostEqual(self.ag.group_avg(soft, "total"), 1599.92)

    def test_empty_items(self):
        ag = Aggregator([])
        self.assertEqual(ag.sum("items.x"), 0)
        self.assertEqual(ag.count("items"), 0)
        self.assertEqual(ag.avg("items.x"), 0.0)
        self.assertEqual(ag.min("items.x"), 0)
        self.assertEqual(ag.max("items.x"), 0)

    def test_non_numeric_skipped(self):
        ag = Aggregator([{"v":"abc"},{"v":10},{"v":"x"}])
        self.assertAlmostEqual(ag.sum("items.v"), 10.0)
        self.assertEqual(ag.count("items.v"), 3)

    def test_path_without_prefix(self):
        # "total" == "items.total"
        self.assertAlmostEqual(self.ag.sum("total"), self.ag.sum("items.total"))


# ═════════════════════════════════════════════════════════════════
class TestExpressionEvaluator(unittest.TestCase):

    def setUp(self):
        self.ev = ExpressionEvaluator(ITEMS)
        self.r  = FieldResolver(DATA)
        self.ri = self.r.with_item(ITEMS[0])  # Laptop item

    def test_simple_field(self):
        self.assertEqual(self.ev.eval_expr("item.code", self.ri), "A001")

    def test_nested_field(self):
        self.assertEqual(self.ev.eval_expr("client.name", self.r), "ACME Corp")

    def test_arithmetic_multiply(self):
        result = self.ev.eval_expr("item.qty * item.unit_price", self.ri)
        self.assertAlmostEqual(float(result), 4999.95)

    def test_arithmetic_complex(self):
        result = self.ev.eval_expr("item.qty * item.unit_price * (1 - item.discount)", self.ri)
        self.assertAlmostEqual(float(result), 4749.9525)

    def test_arithmetic_add(self):
        result = self.ev.eval_expr("item.qty + 10", self.ri)
        self.assertEqual(result, 15)

    def test_aggregation_sum(self):
        result = self.ev.eval_expr("sum(items.total)", self.r)
        self.assertAlmostEqual(float(result),
                               sum(it["total"] for it in ITEMS))

    def test_aggregation_count(self):
        result = self.ev.eval_expr("count(items)", self.r)
        self.assertEqual(result, 5)

    def test_aggregation_avg(self):
        result = self.ev.eval_expr("avg(items.unit_price)", self.r)
        self.assertAlmostEqual(float(result), 2229.95 / 5)

    def test_aggregation_min(self):
        result = self.ev.eval_expr("min(items.unit_price)", self.r)
        self.assertAlmostEqual(float(result), 29.99)

    def test_aggregation_max(self):
        result = self.ev.eval_expr("max(items.unit_price)", self.r)
        self.assertAlmostEqual(float(result), 999.99)

    def test_ternary_true(self):
        result = self.ev.eval_expr('item.qty > 3 ? "High" : "Low"', self.ri)
        self.assertEqual(result, "High")

    def test_ternary_false(self):
        ri2 = self.r.with_item(ITEMS[1])  # qty=20 > 3 is True
        ri3 = self.r.with_item(ITEMS[2])  # qty=3 > 3 is False
        self.assertEqual(self.ev.eval_expr('item.qty > 3 ? "Yes" : "No"', ri3), "No")

    def test_comparison_gt(self):
        result = self.ev.eval_expr("item.unit_price > 500", self.ri)
        self.assertTrue(result)

    def test_comparison_lt(self):
        ri2 = self.r.with_item(ITEMS[1])
        result = self.ev.eval_expr("item.unit_price < 50", ri2)
        self.assertTrue(result)

    def test_contains_expr(self):
        self.assertTrue(self.ev.contains_expr("Total: {sum(items.total)}"))
        self.assertFalse(self.ev.contains_expr("No expressions here"))

    def test_eval_text_template(self):
        result = self.ev.eval_text("Period: {period}", self.r)
        self.assertEqual(result, "Period: Q4 2025")

    def test_eval_text_multi(self):
        result = self.ev.eval_text("{client.name} — {period}", self.r)
        self.assertEqual(result, "ACME Corp — Q4 2025")

    def test_eval_text_aggregation(self):
        result = self.ev.eval_text("Items: {count(items)}", self.r)
        self.assertEqual(result, "Items: 5")

    def test_safe_eval_arithmetic(self):
        self.assertEqual(_safe_eval("2 + 3 * 4"), 14)
        self.assertEqual(_safe_eval("10 / 2"), 5.0)
        self.assertEqual(_safe_eval("10 > 5"), True)

    def test_safe_eval_blocks_import(self):
        # Should not raise — returns expr as string when blocked
        result = _safe_eval("__import__('os')")
        self.assertIsInstance(result, str)

    def test_coerce_str_int_float(self):
        self.assertEqual(_coerce_str(5.0), "5")
        self.assertEqual(_coerce_str(5.5), "5.5")
        self.assertEqual(_coerce_str(True), "Yes")
        self.assertEqual(_coerce_str(None), "")

    def test_agg_in_arithmetic(self):
        # sum(items.total) + 100
        result = self.ev.eval_expr("sum(items.total) + 100", self.r)
        expected = sum(it["total"] for it in ITEMS) + 100
        self.assertAlmostEqual(float(result), expected)


# ═════════════════════════════════════════════════════════════════
class TestFieldFormatter(unittest.TestCase):

    def test_currency(self):
        self.assertEqual(_format_value(1234.5, "currency"), "1,234.50")

    def test_currency_sign(self):
        self.assertEqual(_format_value(1234.5, "currency_sign"), "$ 1,234.50")

    def test_int(self):
        self.assertEqual(_format_value(12345.9, "int"), "12,346")

    def test_float2(self):
        self.assertEqual(_format_value(3.14159, "float2"), "3.14")

    def test_pct(self):
        self.assertEqual(_format_value(0.105, "pct"), "0.1%")

    def test_pct2(self):
        self.assertEqual(_format_value(0.15, "pct2"), "15.0%")

    def test_upper(self):
        self.assertEqual(_format_value("hello", "upper"), "HELLO")

    def test_date_iso(self):
        self.assertEqual(_format_value("2025-11-19", "date"), "19/11/2025")

    def test_date_iso_time(self):
        self.assertEqual(_format_value("2025-11-19T16:25:46", "datetime"), "19/11/2025 16:25:46")

    def test_bool_si_no(self):
        self.assertEqual(_format_value(True, "bool_si_no"), "SI")
        self.assertEqual(_format_value(False, "bool_si_no"), "NO")

    def test_unknown_fmt(self):
        self.assertEqual(_format_value("abc", "unknown_fmt"), "abc")

    def test_none_fmt(self):
        self.assertEqual(_format_value("hello", None), "hello")


# ═════════════════════════════════════════════════════════════════
class TestFieldResolver(unittest.TestCase):

    def setUp(self):
        self.r  = FieldResolver(DATA)
        self.ri = self.r.with_item(ITEMS[0])

    def test_dot_path(self):
        self.assertEqual(self.r.get("client.name"), "ACME Corp")

    def test_nested(self):
        self.assertEqual(self.r.get("company.ruc"), "0991234567001")

    def test_item_prefix(self):
        self.assertEqual(self.ri.get("item.code"), "A001")
        self.assertEqual(self.ri.get("item.name"), "Laptop")

    def test_item_no_prefix(self):
        self.assertEqual(self.ri.get("code"), "A001")

    def test_missing_key_returns_default(self):
        self.assertEqual(self.r.get("nonexistent"), "")
        self.assertEqual(self.r.get("nonexistent", "N/A"), "N/A")

    def test_items_property(self):
        self.assertEqual(len(self.r.items), 5)

    def test_get_formatted(self):
        self.assertEqual(self.ri.get_formatted("item.unit_price", "currency"), "999.99")

    def test_strip_braces(self):
        self.assertEqual(self.r.get("{client.name}"), "ACME Corp")


# ═════════════════════════════════════════════════════════════════
class TestNormalizer(unittest.TestCase):

    def test_basic(self):
        raw = {"name":"T","sections":[{"stype":"detail","height":20}],"elements":[]}
        n   = normalize_layout(raw)
        self.assertEqual(n["sections"][0]["stype"], "det")
        self.assertEqual(n["pageSize"], "A4")
        self.assertTrue(n["_normalized"])

    def test_stype_aliases(self):
        stypes = [("report_header","rh"),("page_header","ph"),("group_header","gh"),
                  ("group_footer","gf"),("page_footer","pf"),("report_footer","rf"),
                  ("detail","det"),("body","det"),("header","rh"),("footer","pf")]
        for alias, expected in stypes:
            raw = {"sections":[{"stype":alias,"height":20}],"elements":[]}
            n   = normalize_layout(raw)
            self.assertEqual(n["sections"][0]["stype"], expected, f"Failed for {alias}")

    def test_etype_aliases(self):
        for alias in ["text","label","statictext"]:
            raw = {"sections":[],"elements":[{"type":alias,"sectionId":"x"}]}
            n   = normalize_layout(raw)
            self.assertEqual(n["elements"][0]["type"], "text", f"Failed for {alias}")

    def test_page_size_dimensions(self):
        n = normalize_layout({"sections":[],"elements":[],"pageSize":"A4"})
        self.assertEqual(n["pageWidth"],  793)   # 210mm * 3.7795
        self.assertEqual(n["pageHeight"], 1123)  # 297mm * 3.7795

    def test_landscape_swaps_dims(self):
        n = normalize_layout({"sections":[],"elements":[],"pageSize":"A4","orientation":"landscape"})
        self.assertGreater(n["pageWidth"], n["pageHeight"])

    def test_margins_defaults(self):
        n = normalize_layout({"sections":[],"elements":[]})
        self.assertEqual(n["margins"]["top"], 15)
        self.assertEqual(n["margins"]["left"], 20)

    def test_margins_custom(self):
        n = normalize_layout({"sections":[],"elements":[],"margins":{"top":10,"bottom":10,"left":15,"right":15}})
        self.assertEqual(n["margins"]["top"], 10)

    def test_groups_normalization(self):
        n = normalize_layout({"sections":[],"elements":[],"groups":[{"field":"category","sortDesc":False}]})
        self.assertEqual(n["groups"][0]["field"], "category")

    def test_groups_string_shorthand(self):
        n = normalize_layout({"sections":[],"elements":[],"groups":"category"})
        self.assertEqual(n["groups"][0]["field"], "category")

    def test_sort_normalization(self):
        n = normalize_layout({"sections":[],"elements":[],"sortBy":[{"field":"name","desc":True}]})
        self.assertEqual(n["sortBy"][0]["field"], "name")
        self.assertTrue(n["sortBy"][0]["desc"])

    def test_element_defaults(self):
        raw = {"sections":[],"elements":[{"type":"field","sectionId":"s1","fieldPath":"x.y"}]}
        n   = normalize_layout(raw)
        el  = n["elements"][0]
        self.assertEqual(el["fontSize"], 8)
        self.assertFalse(el["bold"])
        self.assertEqual(el["align"], "left")
        self.assertEqual(el["color"], "#000000")

    def test_element_camelcase_alias(self):
        raw = {"sections":[],"elements":[{"type":"data","section":"s1","dataField":"price"}]}
        n   = normalize_layout(raw)
        el  = n["elements"][0]
        self.assertEqual(el["type"], "field")
        self.assertEqual(el["sectionId"], "s1")
        self.assertEqual(el["fieldPath"], "price")

    def test_unknown_element_type_dropped(self):
        raw = {"sections":[],"elements":[{"type":"unknown_widget","sectionId":"s1"}]}
        n   = normalize_layout(raw)
        self.assertEqual(len(n["elements"]), 0)

    def test_section_group_index(self):
        raw = {"sections":[{"stype":"group_header","height":20,"groupIndex":1}],"elements":[]}
        n   = normalize_layout(raw)
        self.assertEqual(n["sections"][0]["groupIndex"], 1)

    def test_iterates_auto_for_det(self):
        raw = {"sections":[{"stype":"det","height":16}],"elements":[]}
        n   = normalize_layout(raw)
        self.assertEqual(n["sections"][0]["iterates"], "items")

    def test_preserves_explicit_pagewidth(self):
        n = normalize_layout({"sections":[],"elements":[],"pageWidth":600})
        self.assertEqual(n["pageWidth"], 600)


# ═════════════════════════════════════════════════════════════════
class TestLayoutLoader(unittest.TestCase):

    def setUp(self):
        raw  = normalize_layout(minimal_layout_raw())
        self.layout = layout_from_dict(raw)

    def test_layout_name(self):
        self.assertEqual(self.layout.name, "Test Report")

    def test_sections_count(self):
        self.assertEqual(len(self.layout.sections), 5)

    def test_section_types(self):
        stypes = [s.stype for s in self.layout.sections]
        self.assertIn("rh", stypes)
        self.assertIn("ph", stypes)
        self.assertIn("det", stypes)
        self.assertIn("pf", stypes)
        self.assertIn("rf", stypes)

    def test_elements_count(self):
        self.assertGreater(len(self.layout.elements), 5)

    def test_elements_for_section(self):
        els = self.layout.elements_for("s-dt")
        self.assertGreater(len(els), 0)
        for el in els:
            self.assertEqual(el.sectionId, "s-dt")

    def test_detail_section(self):
        det = self.layout.detail_section
        self.assertIsNotNone(det)
        self.assertTrue(det.is_iterable)

    def test_section_tops_accumulate(self):
        tops = [s.top for s in self.layout.sections]
        self.assertEqual(tops[0], 0)
        self.assertEqual(tops[1], self.layout.sections[0].height)

    def test_sections_of_type(self):
        dets = self.layout.sections_of_type("det")
        self.assertEqual(len(dets), 1)

    def test_element_wysiwyg_fields(self):
        el = self.layout.elements[0]
        for attr in ["id","type","sectionId","x","y","w","h",
                     "fontFamily","fontSize","bold","italic","underline",
                     "align","color","bgColor","borderColor","borderWidth",
                     "content","fieldPath","fieldFmt","zIndex"]:
            self.assertTrue(hasattr(el, attr), f"Element missing: {attr}")

    def test_element_advanced_fields(self):
        el = self.layout.elements[0]
        for attr in ["canGrow","canShrink","wordWrap","src","srcFit",
                     "conditionalStyles","suppressIfEmpty"]:
            self.assertTrue(hasattr(el, attr), f"Element missing: {attr}")

    def test_zindex_sort(self):
        raw = normalize_layout({"sections":[{"stype":"det","height":16}],"elements":[
            {"type":"text","sectionId":"s-0","x":0,"y":0,"w":10,"h":10,"zIndex":5},
            {"type":"text","sectionId":"s-0","x":0,"y":0,"w":10,"h":10,"zIndex":1},
            {"type":"text","sectionId":"s-0","x":0,"y":0,"w":10,"h":10,"zIndex":3},
        ]})
        layout = layout_from_dict(raw)
        els = layout.elements_for("s-0")
        self.assertEqual([e.zIndex for e in els], [1,3,5])


# ═════════════════════════════════════════════════════════════════
class TestAdvancedHtmlEngine(unittest.TestCase):

    def _render(self, extra_secs=None, extra_els=None, data=None) -> str:
        raw  = minimal_layout_raw(extra_secs, extra_els)
        d    = data or DATA
        return AdvancedHtmlEngine(raw, d).render()

    def test_valid_html_structure(self):
        html = self._render()
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn("<html", html)
        self.assertIn("</html>", html)
        self.assertIn("<body>", html)

    def test_css_atpage(self):
        html = self._render()
        self.assertIn("@page", html)
        self.assertIn("size: A4", html)

    def test_absolute_positioning(self):
        html = self._render()
        self.assertIn("position:absolute", html)

    def test_report_header_rendered(self):
        html = self._render()
        self.assertIn("Q4 2025", html)  # {period} in rh-1 content

    def test_page_header_rendered(self):
        html = self._render()
        self.assertIn("ACME Corp", html)  # {client.name} in ph-1

    def test_detail_rows_per_item(self):
        html = self._render()
        # Each item produces one detail row; we have 5 items
        self.assertEqual(html.count('data-row='), 5)

    def test_item_codes_appear(self):
        html = self._render()
        for item in ITEMS:
            self.assertIn(item["code"], html)

    def test_item_names_appear(self):
        html = self._render()
        for item in ITEMS:
            self.assertIn(item["name"], html)

    def test_currency_format(self):
        html = self._render()
        # Laptop unit_price 999.99
        self.assertIn("999.99", html)

    def test_aggregation_sum_rendered(self):
        html = self._render()
        expected = f"{sum(it['total'] for it in ITEMS):,.2f}"
        self.assertIn(expected, html)

    def test_count_rendered(self):
        html = self._render()
        self.assertIn("5", html)  # count(items) = 5

    def test_arithmetic_expression(self):
        html = self._render()
        # item.qty * item.unit_price for Laptop: 5 * 999.99 = 4,999.95
        self.assertIn("4,999.95", html)

    def test_line_svg(self):
        extra = [{"id":"test-line","type":"line","sectionId":"s-rh","x":0,"y":50,
                   "w":400,"h":2,"borderColor":"#999","borderWidth":2}]
        html = self._render(extra_els=extra)
        self.assertIn("<svg", html)
        self.assertIn("<line", html)

    def test_rect_rendered(self):
        extra = [{"id":"test-rect","type":"rect","sectionId":"s-rh","x":0,"y":0,
                   "w":100,"h":20,"bgColor":"#FF0000","borderColor":"#000","borderWidth":1}]
        html = self._render(extra_els=extra)
        self.assertIn("#FF0000", html)

    def test_alternating_rows(self):
        html = self._render()
        self.assertIn("#F4F4F2", html)

    def test_debug_mode(self):
        raw  = minimal_layout_raw()
        html = AdvancedHtmlEngine(raw, DATA, debug=True).render()
        self.assertIn("outline:", html)

    def test_empty_items(self):
        data = {**DATA, "items": []}
        html = self._render(data=data)
        self.assertIn("<!DOCTYPE html>", html)
        self.assertEqual(html.count("data-row="), 0)

    def test_section_stype_attrs(self):
        html = self._render()
        self.assertIn('data-stype="rh"', html)
        self.assertIn('data-stype="det"', html)
        self.assertIn('data-stype="pf"', html)

    def test_text_expression_in_content(self):
        html = self._render()
        # rh-1 content = "Report: {period}" → "Report: Q4 2025"
        self.assertIn("Report: Q4 2025", html)

    def test_conditional_style_applied(self):
        extra = [{"id":"dt-cond","type":"field","sectionId":"s-dt","x":520,"y":1,"w":60,"h":14,
                  "fieldPath":"item.stock > 10 ? \"OK\" : \"LOW\"","fontSize":7,
                  "conditionalStyles":[{"condition":"item.stock < 5","style":{"color":"#C62828","bold":True}}]}]
        html = self._render(extra_els=extra)
        self.assertIn("#C62828", html)  # conditional style on low-stock items

    def test_page_width_in_css(self):
        html = self._render()
        self.assertIn("754px", html)


# ═════════════════════════════════════════════════════════════════
class TestGroupingEngine(unittest.TestCase):

    def setUp(self):
        self.layout_raw = {
            "name": "Grouped Report",
            "pageSize": "A4",
            "groups": [{"field":"category","sortDesc":False}],
            "sortBy":  [{"field":"category","desc":False}],
            "sections": [
                {"id":"s-rh","stype":"rh","label":"RH","height":40},
                {"id":"s-ph","stype":"ph","label":"PH","height":30},
                {"id":"s-gh","stype":"gh","label":"GH","height":20,"groupIndex":0},
                {"id":"s-dt","stype":"det","label":"DT","height":14,"iterates":"items"},
                {"id":"s-gf","stype":"gf","label":"GF","height":18,"groupIndex":0},
                {"id":"s-pf","stype":"pf","label":"PF","height":30},
                {"id":"s-rf","stype":"rf","label":"RF","height":30},
            ],
            "elements": [
                {"id":"gh-cat","type":"field","sectionId":"s-gh","x":4,"y":4,"w":300,"h":12,
                 "fieldPath":"item.category","fontSize":9,"bold":True},
                {"id":"dt-code","type":"field","sectionId":"s-dt","x":4,"y":1,"w":80,"h":12,
                 "fieldPath":"item.code","fontSize":8},
                {"id":"dt-name","type":"field","sectionId":"s-dt","x":88,"y":1,"w":200,"h":12,
                 "fieldPath":"item.name","fontSize":8},
                {"id":"gf-sum","type":"field","sectionId":"s-gf","x":400,"y":4,"w":120,"h":10,
                 "fieldPath":"sum(items.total)","fieldFmt":"currency","fontSize":8,"align":"right"},
            ]
        }

    def test_group_headers_rendered(self):
        html = AdvancedHtmlEngine(self.layout_raw, DATA).render()
        self.assertIn('data-stype="gh"', html)

    def test_group_footers_rendered(self):
        html = AdvancedHtmlEngine(self.layout_raw, DATA).render()
        self.assertIn('data-stype="gf"', html)

    def test_group_values_appear(self):
        html = AdvancedHtmlEngine(self.layout_raw, DATA).render()
        # Each unique category should appear in group headers
        for cat in {"Electronics", "Furniture", "Software"}:
            self.assertIn(cat, html)

    def test_all_items_rendered(self):
        html = AdvancedHtmlEngine(self.layout_raw, DATA).render()
        # All item codes should appear
        for item in ITEMS:
            self.assertIn(item["code"], html)

    def test_sort_applied(self):
        # Items should be sorted by category — Electronics before Furniture before Software
        html = AdvancedHtmlEngine(self.layout_raw, DATA).render()
        elec_pos = html.find("Electronics")
        furn_pos = html.find("Furniture")
        soft_pos = html.find("Software")
        self.assertLess(elec_pos, furn_pos)
        self.assertLess(furn_pos, soft_pos)

    def test_group_aggregate_rendered(self):
        html = AdvancedHtmlEngine(self.layout_raw, DATA).render()
        # Electronics group total: 4749.95 + 539.82 = 5289.77
        elec_total = sum(it["total"] for it in ITEMS if it["category"]=="Electronics")
        self.assertIn(f"{elec_total:,.2f}", html)


# ═════════════════════════════════════════════════════════════════
class TestPaginationEngine(unittest.TestCase):

    def _make_data(self, n_items: int) -> dict:
        return {**DATA, "items": [
            {"code":f"X{i:03}","name":f"Product {i}","category":"Cat",
             "qty":1,"unit_price":10.0,"discount":0.0,"total":10.0,"stock":5}
            for i in range(n_items)
        ]}

    def _render_pages(self, n_items: int) -> str:
        raw  = minimal_layout_raw()
        data = self._make_data(n_items)
        return AdvancedHtmlEngine(raw, data).render()

    def test_single_page_few_items(self):
        html = self._render_pages(5)
        self.assertEqual(html.count('class="rpt-page"'), 1)

    def test_multiple_pages_many_items(self):
        # With 200 items of 16px each in a ~900px body, we get multiple pages
        html = self._render_pages(200)
        pages = html.count('class="rpt-page"')
        self.assertGreater(pages, 1)

    def test_ph_repeated_on_every_page(self):
        html = self._render_pages(200)
        pages = html.count('class="rpt-page"')
        # PH appears once per page
        ph_count = html.count('data-stype="ph"')
        self.assertEqual(ph_count, pages)

    def test_rf_only_on_last_page(self):
        html = self._render_pages(200)
        rf_count = html.count('data-stype="rf"')
        self.assertEqual(rf_count, 1)

    def test_all_items_present_paginated(self):
        n = 80
        html = self._render_pages(n)
        for i in range(n):
            self.assertIn(f"X{i:03}", html)


# ═════════════════════════════════════════════════════════════════
class TestCanGrowWordWrap(unittest.TestCase):

    def test_can_grow_element_present(self):
        extra = [{"id":"dt-long","type":"field","sectionId":"s-dt","x":4,"y":0,"w":300,"h":14,
                  "fieldPath":"item.name","fontSize":8,"canGrow":True,"wordWrap":True}]
        raw  = minimal_layout_raw(extra_els=extra)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn("pre-wrap", html)

    def test_nowrap_default(self):
        raw  = minimal_layout_raw()
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn("nowrap", html)

    def test_word_wrap_class_applied(self):
        extra = [{"id":"dt-wrap","type":"text","sectionId":"s-rh","x":4,"y":0,"w":300,"h":14,
                  "content":"Long text here","wordWrap":True}]
        raw  = minimal_layout_raw(extra_els=extra)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn('class="cr-el wrap"', html)


# ═════════════════════════════════════════════════════════════════
class TestImageRendering(unittest.TestCase):

    def test_image_placeholder(self):
        extra = [{"id":"img-1","type":"image","sectionId":"s-rh","x":4,"y":4,
                  "w":100,"h":60,"content":"Logo"}]
        raw  = minimal_layout_raw(extra_els=extra)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn("Logo", html)
        self.assertIn("image", html.lower())

    def test_image_url(self):
        extra = [{"id":"img-2","type":"image","sectionId":"s-rh","x":4,"y":4,
                  "w":100,"h":60,"src":"https://example.com/logo.png"}]
        raw  = minimal_layout_raw(extra_els=extra)
        html = AdvancedHtmlEngine(raw, DATA).render()
        self.assertIn("https://example.com/logo.png", html)
        self.assertIn("<img", html)

    def test_image_from_field(self):
        data = {**DATA, "logo_url": "https://example.com/img.png"}
        extra = [{"id":"img-3","type":"image","sectionId":"s-rh","x":4,"y":4,
                  "w":100,"h":60,"fieldPath":"logo_url"}]
        raw  = minimal_layout_raw(extra_els=extra)
        html = AdvancedHtmlEngine(raw, data).render()
        self.assertIn("https://example.com/img.png", html)


# ═════════════════════════════════════════════════════════════════
class TestExampleFiles(unittest.TestCase):
    """Verify the bundled example files render correctly."""

    EXAMPLES = Path(__file__).parent.parent / "examples"

    def test_example_layout_exists(self):
        self.assertTrue((self.EXAMPLES / "sales_report.rfd.json").exists())

    def test_example_data_exists(self):
        self.assertTrue((self.EXAMPLES / "sales_data.json").exists())

    def test_example_layout_valid_json(self):
        raw = json.loads((self.EXAMPLES / "sales_report.rfd.json").read_text())
        self.assertIn("sections", raw)
        self.assertIn("elements", raw)

    def test_example_data_valid_json(self):
        data = json.loads((self.EXAMPLES / "sales_data.json").read_text())
        self.assertIn("items", data)
        self.assertGreater(len(data["items"]), 0)

    def test_example_renders_html(self):
        raw  = json.loads((self.EXAMPLES / "sales_report.rfd.json").read_text())
        data = json.loads((self.EXAMPLES / "sales_data.json").read_text())
        html = render_advanced(raw, data)
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn("Sales Report", html)
        self.assertIn("Electronics", html)
        self.assertIn("ACME Corp", html)
        # All 12 items
        self.assertEqual(html.count("data-row="), 12)

    def test_example_group_headers(self):
        raw  = json.loads((self.EXAMPLES / "sales_report.rfd.json").read_text())
        data = json.loads((self.EXAMPLES / "sales_data.json").read_text())
        html = render_advanced(raw, data)
        for cat in ("Electronics", "Furniture", "Software", "Supplies"):
            self.assertIn(cat, html)
        self.assertIn('data-stype="gh"', html)
        self.assertIn('data-stype="gf"', html)

    def test_example_report_footer(self):
        raw  = json.loads((self.EXAMPLES / "sales_report.rfd.json").read_text())
        data = json.loads((self.EXAMPLES / "sales_data.json").read_text())
        html = render_advanced(raw, data)
        self.assertIn('data-stype="rf"', html)
        # Grand total should be sum of all item totals
        grand = sum(it["total"] for it in data["items"])
        self.assertIn(f"{grand:,.2f}", html)

    def test_example_conditional_stock(self):
        raw  = json.loads((self.EXAMPLES / "sales_report.rfd.json").read_text())
        data = json.loads((self.EXAMPLES / "sales_data.json").read_text())
        html = render_advanced(raw, data)
        # Low stock items (stock<5: Mouse stock=3, Standing Desk stock=2) → #C62828
        self.assertIn("#C62828", html)


# ═════════════════════════════════════════════════════════════════
class TestRenderAdvanced(unittest.TestCase):

    def test_render_advanced_dict(self):
        raw  = minimal_layout_raw()
        html = render_advanced(raw, DATA)
        self.assertIn("<!DOCTYPE html>", html)

    def test_render_advanced_writes_file(self):
        import tempfile
        raw  = minimal_layout_raw()
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as f:
            out_path = Path(f.name)
        try:
            render_advanced(raw, DATA, output_path=out_path)
            self.assertTrue(out_path.exists())
            content = out_path.read_text(encoding="utf-8")
            self.assertIn("<!DOCTYPE html>", content)
        finally:
            out_path.unlink(missing_ok=True)

    def test_render_advanced_from_file(self):
        lp = Path(__file__).parent.parent / "examples" / "sales_report.rfd.json"
        dp = Path(__file__).parent.parent / "examples" / "sales_data.json"
        if not lp.exists() or not dp.exists():
            self.skipTest("Example files not found")
        data = json.loads(dp.read_text(encoding="utf-8"))
        html = render_advanced(str(lp), data)
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn("Sales Report", html)


# ═════════════════════════════════════════════════════════════════
class TestModuleContracts(unittest.TestCase):

    def test_advanced_engine_module_exports_are_stable(self):
        from core.render.engines import advanced_engine as mod

        for name in [
            "AdvancedHtmlEngine",
            "render_advanced",
            "render_from_layout_file",
            "_render_barcode_svg",
            "_render_crosstab",
            "_svg_linear_barcode",
            "_svg_qr_placeholder",
        ]:
            self.assertTrue(hasattr(mod, name), name)

    def test_split_helper_modules_exist_and_export(self):
        from core.render.engines import advanced_engine_shared, barcode_renderer, crosstab_renderer, element_renderers

        self.assertTrue(hasattr(advanced_engine_shared, "_SPECIAL"))
        self.assertTrue(hasattr(advanced_engine_shared, "_esc"))
        self.assertTrue(hasattr(barcode_renderer, "_render_barcode_svg"))
        self.assertTrue(hasattr(barcode_renderer, "_svg_linear_barcode"))
        self.assertTrue(hasattr(barcode_renderer, "_svg_qr_placeholder"))
        self.assertTrue(hasattr(crosstab_renderer, "_render_crosstab"))
        self.assertTrue(hasattr(element_renderers, "render_element"))
        self.assertTrue(hasattr(element_renderers, "calc_row_height"))


# ═════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    unittest.main(verbosity=2)
