# tests/test_render_engine.py
# ─────────────────────────────────────────────────────────────────
# Suite WYSIWYG — verifica que el pipeline Designer → PDF sea fiel.
# Corre sin SAP y sin WeasyPrint instalados.
# ─────────────────────────────────────────────────────────────────

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.render.resolvers.field_resolver import FieldResolver
from core.render.resolvers.layout_loader  import (
    Layout, Section, Element, default_invoice_layout,
    load_layout, layout_from_dict,
)
from core.render.engines.html_engine  import HtmlEngine
from core.render.engines.pdf_generator import PdfGenerator, PdfGeneratorError
from core.render.render_engine import RenderEngine, RenderEngineError

# ── Fixture ───────────────────────────────────────────────────────
SAMPLE_DATA = {
    "meta": {
        "doc_entry": 20482, "doc_num": 20482,
        "obj_type": "13",   "currency": "USD",
    },
    "empresa": {
        "razon_social":          "DISTRIBUIDORA EPSON ECUADOR S.A.",
        "nombre_comercial":      "EPSON ECUADOR",
        "ruc":                   "0991234567001",
        "direccion_matriz":      "Av. 9 de Octubre 1234, Guayaquil",
        "obligado_contabilidad": "SI",
        "agente_retencion":      "NO",
    },
    "cliente": {
        "razon_social":   "SILVA LEON ROBERTO CARLOS",
        "identificacion": "0923748188",
        "direccion":      "44 Y SEDALANA, Guayaquil",
        "email":          "roberto@email.com",
    },
    "fiscal": {
        "ambiente":              "PRUEBAS",
        "tipo_emision":          "NORMAL",
        "numero_documento":      "002-101-000020482",
        "numero_autorizacion":   "2602202601991234567001120010010000204821234567811",
        "fecha_autorizacion":    "2025-11-19T16:25:46",
        "clave_acceso":          "2602202601991234567001120010010000204821234567811",
    },
    "pago": {
        "forma_pago_fe": "01",
        "total":         108.00,
    },
    "items": [
        {"codigo": "A001", "descripcion": "Producto Alpha",  "cantidad": 2, "precio_unitario": 30.00, "descuento": 0, "subtotal": 60.00},
        {"codigo": "B002", "descripcion": "Producto Beta",   "cantidad": 1, "precio_unitario": 28.00, "descuento": 0, "subtotal": 28.00},
        {"codigo": "C003", "descripcion": "Producto Gamma",  "cantidad": 4, "precio_unitario":  5.00, "descuento": 0, "subtotal": 20.00},
    ],
    "totales": {
        "subtotal_12":             108.00,
        "subtotal_0":                0.00,
        "subtotal_sin_impuestos":  108.00,
        "iva_12":                   16.20,
        "importe_total":           124.20,
    },
}


# ═════════════════════════════════════════════════════════════════
class TestFieldResolver(unittest.TestCase):

    def setUp(self):
        self.r = FieldResolver(SAMPLE_DATA)

    def test_resuelve_campo_simple(self):
        self.assertEqual(self.r.get("meta.doc_entry"), 20482)

    def test_resuelve_campo_anidado(self):
        self.assertEqual(self.r.get("empresa.ruc"), "0991234567001")

    def test_resuelve_cliente(self):
        self.assertEqual(self.r.get("cliente.razon_social"), "SILVA LEON ROBERTO CARLOS")

    def test_resuelve_fiscal(self):
        self.assertEqual(self.r.get("fiscal.numero_documento"), "002-101-000020482")

    def test_resuelve_total_float(self):
        self.assertAlmostEqual(float(self.r.get("totales.importe_total")), 124.20)

    def test_campo_inexistente_retorna_default(self):
        self.assertEqual(self.r.get("no.existe"), "")
        self.assertEqual(self.r.get("no.existe", "N/A"), "N/A")

    def test_items_lista(self):
        self.assertIsInstance(self.r.items, list)
        self.assertEqual(len(self.r.items), 3)

    def test_with_item_resuelve_codigo(self):
        item = {"codigo": "XYZ", "descripcion": "Test", "subtotal": 9.99}
        ri = self.r.with_item(item)
        self.assertEqual(ri.get("item.codigo"), "XYZ")

    def test_with_item_no_contamina_resolver_original(self):
        item = {"codigo": "XYZ"}
        ri = self.r.with_item(item)
        self.assertEqual(ri.get("item.codigo"), "XYZ")
        self.assertEqual(self.r.get("item.codigo"), "")

    def test_with_item_resuelve_subtotal(self):
        item = {"subtotal": 42.50}
        ri = self.r.with_item(item)
        self.assertEqual(float(ri.get("item.subtotal")), 42.50)


# ═════════════════════════════════════════════════════════════════
class TestFieldFormatters(unittest.TestCase):

    def setUp(self):
        self.r = FieldResolver(SAMPLE_DATA)

    def test_fmt_currency(self):
        r = FieldResolver({"totales": {"importe_total": 124.20}, "meta": {}, "empresa": {},
                           "cliente": {}, "fiscal": {}, "pago": {}, "items": []})
        v = r.get_formatted("totales.importe_total", "currency")
        self.assertIn("124.20", v)

    def test_fmt_float2(self):
        r = FieldResolver({"items": [{"cantidad": 6}], "meta":{}, "empresa":{},
                           "cliente":{}, "fiscal":{}, "pago":{}, "totales":{}})
        ri = r.with_item(r.items[0])
        v = ri.get_formatted("item.cantidad", "float2")
        self.assertEqual(v, "6.00")

    def test_fmt_date(self):
        v = self.r.get_formatted("fiscal.fecha_autorizacion", "date")
        self.assertIn("19/11/2025", v)

    def test_fmt_datetime(self):
        v = self.r.get_formatted("fiscal.fecha_autorizacion", "datetime")
        self.assertIn("19/11/2025", v)
        self.assertIn("16:25", v)

    def test_fmt_ruc_mask(self):
        v = self.r.get_formatted("empresa.ruc", "ruc_mask")
        self.assertIn("-", v)

    def test_fmt_clave_acceso(self):
        v = self.r.get_formatted("fiscal.clave_acceso", "clave_acceso")
        # Should be broken into space-separated groups
        self.assertIn(" ", v)

    def test_fmt_upper(self):
        r = FieldResolver({"empresa": {"razon_social": "distribuidora"}, "meta":{},
                           "cliente":{}, "fiscal":{}, "pago":{}, "items":[], "totales":{}})
        v = r.get_formatted("empresa.razon_social", "upper")
        self.assertEqual(v, "DISTRIBUIDORA")

    def test_fmt_forma_pago_01(self):
        r = FieldResolver({"pago": {"forma_pago_fe": "01"}, "meta":{}, "empresa":{},
                           "cliente":{}, "fiscal":{}, "items":[], "totales":{}})
        v = r.get_formatted("pago.forma_pago_fe", "forma_pago")
        self.assertIn("SIN UTILIZACIÓN", v)

    def test_fmt_none_retorna_string(self):
        v = self.r.get_formatted("empresa.razon_social", None)
        self.assertIsInstance(v, str)


# ═════════════════════════════════════════════════════════════════
class TestLayoutLoader(unittest.TestCase):

    def setUp(self):
        self.layout = default_invoice_layout()

    def test_layout_tiene_secciones(self):
        self.assertGreater(len(self.layout.sections), 0)

    def test_layout_tiene_elementos(self):
        self.assertGreater(len(self.layout.elements), 0)

    def test_layout_tiene_detail_iterable(self):
        det = self.layout.detail_section
        self.assertIsNotNone(det)
        self.assertTrue(det.is_iterable)
        self.assertEqual(det.iterates, "items")

    def test_section_tops_acumulativos(self):
        tops = [s.top for s in self.layout.sections]
        self.assertEqual(tops[0], 0)
        for i in range(1, len(tops)):
            self.assertGreater(tops[i], tops[i - 1])

    def test_elements_for_devuelve_lista(self):
        det = self.layout.detail_section
        els = self.layout.elements_for(det.id)
        self.assertIsInstance(els, list)
        self.assertGreater(len(els), 0)

    def test_get_section_por_id(self):
        sec = self.layout.get_section("s-rh")
        self.assertIsNotNone(sec)
        self.assertEqual(sec.stype, "rh")

    def test_layout_from_dict(self):
        raw = {"name": "Test", "sections": [
            {"id": "s1", "stype": "rh", "label": "RH", "height": 50}
        ], "elements": []}
        layout = layout_from_dict(raw)
        self.assertEqual(layout.name, "Test")
        self.assertEqual(len(layout.sections), 1)

    def test_element_wysiwyg_fields(self):
        """Element tiene los mismos campos que guarda el Designer."""
        el = self.layout.elements[0]
        for attr in ["x", "y", "w", "h", "fontFamily", "fontSize", "bold",
                     "italic", "underline", "align", "color", "bgColor",
                     "borderColor", "borderWidth", "fieldPath", "fieldFmt",
                     "content", "type", "sectionId", "zIndex"]:
            self.assertTrue(hasattr(el, attr), f"Element missing: {attr}")

    def test_file_not_found_raises(self):
        with self.assertRaises(FileNotFoundError):
            load_layout("/nonexistent/path.rfd.json")

    def test_page_width_default(self):
        self.assertEqual(self.layout.page_width, 754)


# ═════════════════════════════════════════════════════════════════
class TestHtmlEngineWYSIWYG(unittest.TestCase):

    def setUp(self):
        layout       = default_invoice_layout()
        resolver     = FieldResolver(SAMPLE_DATA)
        self.engine  = HtmlEngine(layout, resolver)
        self.html    = self.engine.render()

    def test_genera_html_valido(self):
        self.assertIn("<!DOCTYPE html>", self.html)
        self.assertIn("</html>", self.html)

    def test_contiene_empresa(self):
        self.assertIn("DISTRIBUIDORA EPSON ECUADOR", self.html)

    def test_contiene_ruc_formateado(self):
        self.assertIn("099123456", self.html)

    def test_contiene_nombre_cliente(self):
        self.assertIn("SILVA LEON ROBERTO CARLOS", self.html)

    def test_contiene_numero_documento(self):
        self.assertIn("002-101-000020482", self.html)

    def test_contiene_todos_los_items(self):
        for item in SAMPLE_DATA["items"]:
            self.assertIn(item["descripcion"], self.html)

    def test_contiene_total(self):
        self.assertIn("124.20", self.html)

    def test_posicion_absoluta(self):
        """WYSIWYG: todos los elementos usan position:absolute."""
        self.assertIn("position:absolute", self.html)

    def test_filas_detail_repite_por_item(self):
        """Una fila cr-detail-row por cada item."""
        count = self.html.count("cr-detail-row")
        # count includes the CSS rule (1) + 3 data rows = 4
        self.assertEqual(count, len(SAMPLE_DATA["items"]) + 1)

    def test_secciones_en_html(self):
        count = self.html.count("cr-section")
        # CSS + 4 non-detail sections
        self.assertGreaterEqual(count, 4)

    def test_svg_lineas(self):
        self.assertIn("<line ", self.html)

    def test_css_at_page(self):
        self.assertIn("@page", self.html)

    def test_ambiente_presente(self):
        self.assertIn("PRUEBAS", self.html)

    def test_elemento_rect_orange(self):
        """El rectángulo naranja (borde factura) aparece en el HTML."""
        self.assertIn("#C0511A", self.html)

    def test_debug_mode(self):
        layout   = default_invoice_layout()
        resolver = FieldResolver(SAMPLE_DATA)
        eng_dbg  = HtmlEngine(layout, resolver, debug=True)
        html_dbg = eng_dbg.render()
        self.assertIn("outline", html_dbg)

    def test_items_vacios_no_rompe(self):
        data = dict(SAMPLE_DATA)
        data["items"] = []
        resolver = FieldResolver(data)
        eng      = HtmlEngine(default_invoice_layout(), resolver)
        html     = eng.render()
        self.assertIn("<!DOCTYPE html>", html)
        self.assertNotIn("cr-detail-row", html.replace(".cr-detail-row{", ""))


# ═════════════════════════════════════════════════════════════════
class TestWYSIWYGCycle(unittest.TestCase):
    """
    Verifica que el ciclo Designer → .rfd.json → RenderEngine sea fiel.
    El Designer guarda exactamente los mismos campos que Element lee.
    """

    # Layout mínimo que simula exactamente lo que guarda el Designer
    DESIGNER_OUTPUT = {
        "name": "Test WYSIWYG",
        "version": "1.0",
        "pageWidth": 754,
        "sections": [
            {"id": "s-rh",  "stype": "rh",  "label": "Report Header", "abbr": "EI", "height": 30},
            {"id": "s-d1",  "stype": "det", "label": "Detail",        "abbr": "D",  "height": 14, "iterates": "items"},
            {"id": "s-pf",  "stype": "pf",  "label": "Page Footer",   "abbr": "PP", "height": 20},
        ],
        "elements": [
            # Text element (as saved by Designer)
            {"id": "e1", "type": "text", "sectionId": "s-rh",
             "x": 10, "y": 5, "w": 200, "h": 16,
             "content": "MI EMPRESA S.A.",
             "fontFamily": "Arial", "fontSize": 11, "bold": True,
             "italic": False, "underline": False,
             "align": "left", "color": "#000000",
             "bgColor": "transparent", "borderColor": "transparent",
             "borderWidth": 0, "borderStyle": "solid",
             "lineDir": "h", "lineWidth": 1, "zIndex": 0,
             "fieldPath": "", "fieldFmt": None},
            # Field element (as saved by Designer)
            {"id": "e2", "type": "field", "sectionId": "s-d1",
             "x": 4, "y": 0, "w": 200, "h": 14,
             "fieldPath": "item.descripcion", "fieldFmt": None,
             "content": "item.descripcion",
             "fontFamily": "Arial", "fontSize": 7, "bold": False,
             "italic": False, "underline": False,
             "align": "left", "color": "#000000",
             "bgColor": "transparent", "borderColor": "transparent",
             "borderWidth": 0, "borderStyle": "solid",
             "lineDir": "h", "lineWidth": 1, "zIndex": 0},
            # Field with format
            {"id": "e3", "type": "field", "sectionId": "s-pf",
             "x": 500, "y": 4, "w": 100, "h": 14,
             "fieldPath": "totales.importe_total", "fieldFmt": "currency",
             "content": "totales.importe_total",
             "fontFamily": "Arial", "fontSize": 9, "bold": True,
             "italic": False, "underline": False,
             "align": "right", "color": "#C0511A",
             "bgColor": "transparent", "borderColor": "transparent",
             "borderWidth": 0, "borderStyle": "solid",
             "lineDir": "h", "lineWidth": 1, "zIndex": 0},
        ],
    }

    def test_layout_carga_desde_designer_output(self):
        layout = layout_from_dict(self.DESIGNER_OUTPUT)
        self.assertEqual(layout.name, "Test WYSIWYG")
        self.assertEqual(len(layout.sections), 3)
        self.assertEqual(len(layout.elements), 3)

    def test_element_posicion_exacta(self):
        """Las coordenadas del Designer llegan exactas al Element."""
        layout = layout_from_dict(self.DESIGNER_OUTPUT)
        e1 = layout.elements[0]
        self.assertEqual(e1.x, 10)
        self.assertEqual(e1.y, 5)
        self.assertEqual(e1.w, 200)
        self.assertEqual(e1.h, 16)

    def test_element_fuente_exacta(self):
        """Las propiedades de fuente del Designer llegan exactas."""
        layout = layout_from_dict(self.DESIGNER_OUTPUT)
        e1 = layout.elements[0]
        self.assertEqual(e1.fontFamily, "Arial")
        self.assertEqual(e1.fontSize, 11)
        self.assertTrue(e1.bold)
        self.assertFalse(e1.italic)

    def test_html_contiene_coordenadas_designer(self):
        """El HTML generado usa left:10px top:5px exactamente como el Designer."""
        layout   = layout_from_dict(self.DESIGNER_OUTPUT)
        resolver = FieldResolver(SAMPLE_DATA)
        eng      = HtmlEngine(layout, resolver)
        html     = eng.render()
        self.assertIn("left:10px", html)
        self.assertIn("top:5px", html)

    def test_html_contiene_texto_del_designer(self):
        layout   = layout_from_dict(self.DESIGNER_OUTPUT)
        resolver = FieldResolver(SAMPLE_DATA)
        eng      = HtmlEngine(layout, resolver)
        html     = eng.render()
        self.assertIn("MI EMPRESA S.A.", html)

    def test_html_repite_items(self):
        layout   = layout_from_dict(self.DESIGNER_OUTPUT)
        resolver = FieldResolver(SAMPLE_DATA)
        eng      = HtmlEngine(layout, resolver)
        html     = eng.render()
        for item in SAMPLE_DATA["items"]:
            self.assertIn(item["descripcion"], html)

    def test_html_total_formateado(self):
        layout   = layout_from_dict(self.DESIGNER_OUTPUT)
        resolver = FieldResolver(SAMPLE_DATA)
        eng      = HtmlEngine(layout, resolver)
        html     = eng.render()
        self.assertIn("124.20", html)

    def test_layout_json_roundtrip(self):
        """Serializar y deserializar el layout no pierde información."""
        layout1  = layout_from_dict(self.DESIGNER_OUTPUT)
        raw_json = json.dumps(self.DESIGNER_OUTPUT)
        raw2     = json.loads(raw_json)
        layout2  = layout_from_dict(raw2)
        self.assertEqual(len(layout1.elements), len(layout2.elements))
        e1a = layout1.elements[0]
        e2a = layout2.elements[0]
        self.assertEqual(e1a.x,          e2a.x)
        self.assertEqual(e1a.fontSize,   e2a.fontSize)
        self.assertEqual(e1a.bold,       e2a.bold)
        self.assertEqual(e1a.fieldPath,  e2a.fieldPath)


# ═════════════════════════════════════════════════════════════════
class TestRenderEngine(unittest.TestCase):

    def setUp(self):
        self.engine = RenderEngine()

    def test_info_retorna_dict(self):
        info = self.engine.info()
        self.assertIn("layout_name", info)
        self.assertIn("sections",    info)
        self.assertIn("total_elements", info)

    def test_render_html_retorna_string(self):
        html = self.engine.render_html(SAMPLE_DATA)
        self.assertIsInstance(html, str)
        self.assertIn("<!DOCTYPE", html)

    def test_render_html_valida_dict_incompleto(self):
        with self.assertRaises(RenderEngineError):
            self.engine.render_html({"meta": {}})

    def test_render_html_valida_items_no_lista(self):
        bad = dict(SAMPLE_DATA)
        bad["items"] = "not a list"
        with self.assertRaises(RenderEngineError):
            self.engine.render_html(bad)

    def test_render_html_items_vacios(self):
        data = dict(SAMPLE_DATA)
        data["items"] = []
        html = self.engine.render_html(data)
        self.assertIn("<!DOCTYPE", html)

    @unittest.skipIf(PdfGenerator().is_available(), "WeasyPrint está instalado")
    def test_render_bytes_sin_weasyprint_falla_controlado(self):
        with self.assertRaises(PdfGeneratorError):
            self.engine.render_bytes(SAMPLE_DATA)

    def test_render_invoice_sin_builder_falla_controlado(self):
        import importlib, sys
        # Temporarily replace build_invoice_model with a stub that raises NotImplementedError
        import types
        stub = types.ModuleType("core.models.invoice_model")
        def _stub(doc_entry):
            raise NotImplementedError
        stub.build_invoice_model = _stub
        orig = sys.modules.get("core.models.invoice_model")
        sys.modules["core.models.invoice_model"] = stub
        try:
            with self.assertRaises(RenderEngineError):
                self.engine.render_invoice(99999)
        finally:
            if orig:
                sys.modules["core.models.invoice_model"] = orig
            else:
                del sys.modules["core.models.invoice_model"]

    def test_with_layout_dict_retorna_nuevo_engine(self):
        raw = {
            "name": "Mini",
            "sections": [{"id": "s-rh", "stype": "rh", "height": 30}],
            "elements": []
        }
        e2 = self.engine.with_layout_dict(raw)
        self.assertIsNot(e2, self.engine)
        self.assertEqual(e2.info()["layout_name"], "Mini")

    def test_render_html_contiene_campos_wysiwyg(self):
        html = self.engine.render_html(SAMPLE_DATA)
        self.assertIn("DISTRIBUIDORA EPSON ECUADOR", html)
        self.assertIn("SILVA LEON ROBERTO CARLOS", html)
        self.assertIn("Producto Alpha", html)
        self.assertIn("124.20", html)


# ═════════════════════════════════════════════════════════════════
class TestContratoDatos(unittest.TestCase):

    def test_claves_primer_nivel(self):
        for k in ["meta", "empresa", "cliente", "fiscal", "pago", "items", "totales"]:
            self.assertIn(k, SAMPLE_DATA)

    def test_items_tienen_claves_requeridas(self):
        for item in SAMPLE_DATA["items"]:
            for k in ["codigo", "descripcion", "cantidad", "precio_unitario", "subtotal"]:
                self.assertIn(k, item)

    def test_totales_numericos(self):
        t = SAMPLE_DATA["totales"]
        for k in ["subtotal_12", "subtotal_0", "subtotal_sin_impuestos", "iva_12", "importe_total"]:
            self.assertIsInstance(t[k], (int, float))

    def test_serializable_json(self):
        encoded = json.dumps(SAMPLE_DATA)
        decoded = json.loads(encoded)
        self.assertEqual(decoded["meta"]["doc_entry"], 20482)


# ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    unittest.main(verbosity=2)
