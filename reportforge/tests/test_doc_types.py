# tests/test_doc_types.py
# Suite completa para los 4 tipos de documento nuevos + registro.
# Corre sin SAP ni WeasyPrint.

import json, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.render.doc_registry import (
    REGISTRY, get_doc_type, list_doc_types,
    REMISION_SAMPLE, NOTA_CREDITO_SAMPLE, RETENCION_SAMPLE, LIQUIDACION_SAMPLE,
)
from core.render.resolvers.field_resolver import FieldResolver
from core.render.resolvers.layout_loader  import layout_from_dict
from core.render.engines.html_engine      import HtmlEngine


# ══════════════════════════════════════════════════════════════════
class TestDocRegistry(unittest.TestCase):

    def test_cinco_tipos_registrados(self):
        self.assertEqual(len(REGISTRY), 5)

    def test_claves_correctas(self):
        for k in ["factura","remision","nota_credito","retencion","liquidacion"]:
            self.assertIn(k, REGISTRY)

    def test_codigos_sri(self):
        codes = {dt.sri_code for dt in REGISTRY.values()}
        self.assertSetEqual(codes, {"01","03","04","06","07"})

    def test_get_doc_type_valido(self):
        dt = get_doc_type("remision")
        self.assertEqual(dt.key, "remision")
        self.assertEqual(dt.sri_code, "06")

    def test_get_doc_type_invalido(self):
        with self.assertRaises(KeyError):
            get_doc_type("cheque")

    def test_list_doc_types_estructura(self):
        types = list_doc_types()
        self.assertEqual(len(types), 5)
        for t in types:
            for k in ["key","label","sri_code","color"]:
                self.assertIn(k, t)

    def test_default_layout_cargable(self):
        for key in ["remision","nota_credito","retencion","liquidacion"]:
            dt = get_doc_type(key)
            layout = dt.default_layout()
            self.assertGreater(len(layout.sections), 0)
            self.assertGreater(len(layout.elements), 0)

    def test_builder_no_implementado_lanza_NotImplementedError(self):
        for key in ["remision","nota_credito","retencion","liquidacion"]:
            dt = get_doc_type(key)
            with self.assertRaises(NotImplementedError):
                dt.call_builder(99999)

    def test_sample_data_presente(self):
        for key in ["remision","nota_credito","retencion","liquidacion"]:
            dt = get_doc_type(key)
            self.assertIsNotNone(dt.sample_data)
            self.assertIsInstance(dt.sample_data, dict)

    def test_colores_hex(self):
        for dt in REGISTRY.values():
            self.assertTrue(dt.color.startswith("#"), f"{dt.key} color: {dt.color}")

    def test_field_tree_presente(self):
        for key in ["remision","nota_credito","retencion","liquidacion"]:
            dt = get_doc_type(key)
            self.assertIsNotNone(dt.field_tree)
            self.assertGreater(len(dt.field_tree), 0)


# ══════════════════════════════════════════════════════════════════
class TestRemisionLayout(unittest.TestCase):

    def setUp(self):
        dt = get_doc_type("remision")
        self.layout   = dt.default_layout()
        self.resolver = FieldResolver(REMISION_SAMPLE)
        self.engine   = HtmlEngine(self.layout, self.resolver)
        self.html     = self.engine.render()

    def test_html_valido(self):
        self.assertIn("<!DOCTYPE html>", self.html)

    def test_titulo_guia_remision(self):
        self.assertIn("GUÍA DE REMISIÓN", self.html)

    def test_empresa_remitente(self):
        self.assertIn("DISTRIBUIDORA EPSON ECUADOR", self.html)

    def test_destinatario(self):
        self.assertIn("FERRETERÍA EL PROGRESO", self.html)

    def test_motivo_traslado(self):
        self.assertIn("VENTA", self.html)

    def test_ruta(self):
        self.assertIn("Guayaquil - Quito", self.html)

    def test_placa_vehiculo(self):
        self.assertIn("GBA-1234", self.html)

    def test_transportista(self):
        self.assertIn("TRANSPORTES RÁPIDOS", self.html)

    def test_items_bienes(self):
        for item in REMISION_SAMPLE["items"]:
            self.assertIn(item["codigo"], self.html)

    def test_numero_documento(self):
        self.assertIn("006-001-000000123", self.html)

    def test_clave_acceso_formateada(self):
        # Clave acceso dividida en bloques de 10
        self.assertIn(" ", self.html)

    def test_secciones_cuatro(self):
        self.assertEqual(len(self.layout.sections), 4)

    def test_detail_itera_items(self):
        n = len(REMISION_SAMPLE["items"])
        # CSS rule + n rows
        self.assertEqual(self.html.count("cr-detail-row"), n + 1)

    def test_posicion_absoluta(self):
        self.assertIn("position:absolute", self.html)

    def test_color_azul_remision(self):
        self.assertIn("#1565C0", self.html)

    def test_elementos_mayor_20(self):
        self.assertGreater(len(self.layout.elements), 20)

    def test_json_roundtrip(self):
        raw = get_doc_type("remision")._layout_raw_fn()
        layout2 = layout_from_dict(raw)
        self.assertEqual(len(layout2.sections), len(self.layout.sections))
        self.assertEqual(len(layout2.elements), len(self.layout.elements))


# ══════════════════════════════════════════════════════════════════
class TestNotaCreditoLayout(unittest.TestCase):

    def setUp(self):
        dt = get_doc_type("nota_credito")
        self.layout   = dt.default_layout()
        self.resolver = FieldResolver(NOTA_CREDITO_SAMPLE)
        self.engine   = HtmlEngine(self.layout, self.resolver)
        self.html     = self.engine.render()

    def test_html_valido(self):
        self.assertIn("<!DOCTYPE html>", self.html)

    def test_titulo(self):
        self.assertIn("NOTA DE CRÉDITO", self.html)

    def test_empresa(self):
        self.assertIn("DISTRIBUIDORA EPSON ECUADOR", self.html)

    def test_cliente(self):
        self.assertIn("SILVA LEON ROBERTO CARLOS", self.html)

    def test_doc_modificado(self):
        self.assertIn("002-101-000020482", self.html)

    def test_motivo(self):
        self.assertIn("Devolución de mercadería", self.html)

    def test_numero_documento(self):
        self.assertIn("004-001-000000045", self.html)

    def test_items(self):
        for item in NOTA_CREDITO_SAMPLE["items"]:
            self.assertIn(item["descripcion"], self.html)

    def test_total_formateado(self):
        self.assertIn("6.90", self.html)

    def test_iva(self):
        self.assertIn("0.90", self.html)

    def test_color_rojo(self):
        self.assertIn("#C62828", self.html)

    def test_cinco_secciones(self):
        self.assertEqual(len(self.layout.sections), 5)

    def test_detail_itera(self):
        n = len(NOTA_CREDITO_SAMPLE["items"])
        self.assertEqual(self.html.count("cr-detail-row"), n + 1)

    def test_total_label(self):
        self.assertIn("TOTAL NOTA", self.html)


# ══════════════════════════════════════════════════════════════════
class TestRetencionLayout(unittest.TestCase):

    def setUp(self):
        dt = get_doc_type("retencion")
        self.layout   = dt.default_layout()
        self.resolver = FieldResolver(RETENCION_SAMPLE)
        self.engine   = HtmlEngine(self.layout, self.resolver)
        self.html     = self.engine.render()

    def test_html_valido(self):
        self.assertIn("<!DOCTYPE html>", self.html)

    def test_titulo(self):
        self.assertIn("RETENCIÓN", self.html)

    def test_empresa_agente(self):
        self.assertIn("DISTRIBUIDORA EPSON ECUADOR", self.html)

    def test_numero_resolucion(self):
        self.assertIn("Res. NAC-0532", self.html)

    def test_proveedor(self):
        self.assertIn("CONSULTORES TECH", self.html)

    def test_doc_sustento(self):
        self.assertIn("001-001-000005678", self.html)

    def test_codigos_retencion(self):
        self.assertIn("303", self.html)
        self.assertIn("721", self.html)

    def test_tipos_retencion(self):
        self.assertIn("RENTA", self.html)
        self.assertIn("IVA", self.html)

    def test_porcentajes(self):
        self.assertIn("10.0%", self.html)
        self.assertIn("30.0%", self.html)

    def test_valores_retenidos(self):
        self.assertIn("200.00", self.html)
        self.assertIn("72.00", self.html)

    def test_total_retenido(self):
        self.assertIn("272.00", self.html)

    def test_numero_documento(self):
        self.assertIn("007-001-000000089", self.html)

    def test_color_purpura(self):
        self.assertIn("#4A148C", self.html)

    def test_detail_itera_impuestos(self):
        n = len(RETENCION_SAMPLE["items"])
        self.assertEqual(self.html.count("cr-detail-row"), n + 1)

    def test_cuatro_secciones(self):
        self.assertEqual(len(self.layout.sections), 4)

    def test_base_imponible_total(self):
        self.assertIn("2,240.00", self.html)


# ══════════════════════════════════════════════════════════════════
class TestLiquidacionLayout(unittest.TestCase):

    def setUp(self):
        dt = get_doc_type("liquidacion")
        self.layout   = dt.default_layout()
        self.resolver = FieldResolver(LIQUIDACION_SAMPLE)
        self.engine   = HtmlEngine(self.layout, self.resolver)
        self.html     = self.engine.render()

    def test_html_valido(self):
        self.assertIn("<!DOCTYPE html>", self.html)

    def test_titulo(self):
        self.assertIn("LIQUIDACIÓN DE COMPRAS", self.html)

    def test_empresa_emisor(self):
        self.assertIn("DISTRIBUIDORA EPSON ECUADOR", self.html)

    def test_proveedor_persona_natural(self):
        self.assertIn("MÉNDEZ SUÁREZ JUAN CARLOS", self.html)

    def test_cedula(self):
        self.assertIn("0912345678", self.html)

    def test_banner_vendedor(self):
        self.assertIn("PERSONA NATURAL", self.html)

    def test_items(self):
        for item in LIQUIDACION_SAMPLE["items"]:
            self.assertIn(item["descripcion"][:20], self.html)

    def test_numero_documento(self):
        self.assertIn("003-001-000000012", self.html)

    def test_total_formateado(self):
        self.assertIn("369.60", self.html)

    def test_iva_12(self):
        self.assertIn("39.60", self.html)

    def test_color_verde(self):
        self.assertIn("#2E7D32", self.html)

    def test_cinco_secciones(self):
        self.assertEqual(len(self.layout.sections), 5)

    def test_detail_itera(self):
        n = len(LIQUIDACION_SAMPLE["items"])
        self.assertEqual(self.html.count("cr-detail-row"), n + 1)

    def test_unidad_medida_columna(self):
        self.assertIn("SRV", self.html)

    def test_siete_columnas_detalle(self):
        # Liquidación tiene columna extra U.M.
        det_sec = self.layout.detail_section
        self.assertIsNotNone(det_sec)
        det_elements = self.layout.elements_for(det_sec.id)
        self.assertGreaterEqual(len(det_elements), 7)


# ══════════════════════════════════════════════════════════════════
class TestSampleDataContratos(unittest.TestCase):
    """Verifica que los sample_data cumplen el contrato mínimo."""

    def _check_meta(self, data, obj_type):
        self.assertIn("meta", data)
        self.assertEqual(data["meta"]["obj_type"], obj_type)
        self.assertIn("doc_entry", data["meta"])

    def _check_fiscal(self, data):
        fiscal = data.get("fiscal", {})
        for k in ["numero_documento","clave_acceso","fecha_autorizacion","ambiente"]:
            self.assertIn(k, fiscal, f"fiscal.{k} faltante")
        self.assertEqual(len(fiscal["clave_acceso"].replace(" ","")), 49)

    def test_remision_contrato(self):
        d = REMISION_SAMPLE
        self._check_meta(d, "112")
        self._check_fiscal(d)
        self.assertIn("traslado", d)
        self.assertIn("destinatario", d)
        for item in d["items"]:
            for k in ["codigo","descripcion","cantidad","unidad_medida"]:
                self.assertIn(k, item)

    def test_nota_credito_contrato(self):
        d = NOTA_CREDITO_SAMPLE
        self._check_meta(d, "14")
        self._check_fiscal(d)
        self.assertIn("doc_modificado", d)
        self.assertIn("motivo", d)
        self.assertIn("totales", d)
        for item in d["items"]:
            for k in ["codigo","descripcion","cantidad","precio_unitario","subtotal"]:
                self.assertIn(k, item)

    def test_retencion_contrato(self):
        d = RETENCION_SAMPLE
        self._check_meta(d, "46")
        self._check_fiscal(d)
        self.assertIn("proveedor", d)
        self.assertIn("doc_sustento", d)
        for imp in d["items"]:
            for k in ["tipo","codigo_retencion","descripcion","base_imponible","porcentaje","valor_retenido"]:
                self.assertIn(k, imp)

    def test_liquidacion_contrato(self):
        d = LIQUIDACION_SAMPLE
        self._check_meta(d, "18")
        self._check_fiscal(d)
        self.assertIn("proveedor", d)
        for item in d["items"]:
            for k in ["codigo","descripcion","cantidad","unidad_medida","precio_unitario","subtotal"]:
                self.assertIn(k, item)

    def test_todos_serializables_json(self):
        for sample in [REMISION_SAMPLE, NOTA_CREDITO_SAMPLE, RETENCION_SAMPLE, LIQUIDACION_SAMPLE]:
            encoded = json.dumps(sample)
            decoded = json.loads(encoded)
            self.assertEqual(decoded["meta"]["doc_entry"], sample["meta"]["doc_entry"])

    def test_claves_acceso_49_digitos(self):
        for key, sample in [
            ("remision",     REMISION_SAMPLE),
            ("nota_credito", NOTA_CREDITO_SAMPLE),
            ("retencion",    RETENCION_SAMPLE),
            ("liquidacion",  LIQUIDACION_SAMPLE),
        ]:
            clave = sample["fiscal"]["clave_acceso"].replace(" ","")
            self.assertEqual(len(clave), 49, f"{key}: clave_acceso debe tener 49 dígitos, tiene {len(clave)}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
