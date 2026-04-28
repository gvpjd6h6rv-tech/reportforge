"""
test_failure_localization.py — Failure localization contract tests.

Every coercion/schema error must carry full context for diagnosis:
  module, function, field, value, expected, actual.

Without these fields, a failure in production is a scavenger hunt.
With them, the error is self-describing.

Coverage:
  1. CoercionEvent carries module and function_name (new fields).
  2. to_num mismatch → event.module and event.function_name are non-empty.
  3. parse_date mismatch → same localization contract.
  4. coerce() via coercion_map → event includes field, expected_type, received_type.
  5. RenderEngineError messages name the specific missing key or bad structure.
  6. Localization fields are stable across repeat calls (reproducibility).
  7. module field is the Python module path (contains dot-path or filename).
  8. function_name field is the function where the coercion was called from.
"""
from __future__ import annotations

import unittest
from copy import deepcopy

from reportforge.core.render.expressions.coercion_logger import (
    CoercionLogger, CoercionEvent,
)
from reportforge.core.render.expressions.coercion_map import coerce
from reportforge.core.render.expressions.type_coercion import to_num, parse_date


_BASE = {
    "meta": {"doc_num": "001-001-000000042", "doc_type": "FACTURA",
             "fecha_emision": "2024-01-15"},
    "empresa": {"razon_social": "ACME S.A.", "ruc": "0990123456001",
                "direccion_matriz": "Av. Principal 123"},
    "cliente": {"razon_social": "Cliente Test", "identificacion": "0987654321",
                "direccion": "Calle Secundaria 456", "email": "test@cliente.com"},
    "fiscal": {"numero_documento": "001-001-000000042", "ambiente": "PRODUCCIÓN",
               "tipo_emision": "NORMAL", "fecha_autorizacion": "2024-01-15T10:30:00"},
    "items": [{"codigo": "P001", "descripcion": "Producto de prueba",
               "cantidad": 2, "precio_unitario": 10.50,
               "descuento": 0.0, "subtotal": 21.00}],
    "totales": {"subtotal": 21.00, "descuento": 0.0,
                "iva_12": 2.52, "total": 23.52},
}


class TestCoercionEventLocalizationFields(unittest.TestCase):
    """CoercionEvent must carry module and function_name for full localization."""

    def setUp(self):
        self.logger = CoercionLogger()
        self.logger.enable()

    def tearDown(self):
        self.logger.disable()
        self.logger.clear()

    def test_event_has_module_field(self):
        self.logger.record_mismatch(value="bad", expected_type="number")
        evt = self.logger.last()
        self.assertTrue(hasattr(evt, "module"),
                        "CoercionEvent must have a 'module' field")

    def test_event_has_function_name_field(self):
        self.logger.record_mismatch(value="bad", expected_type="number")
        evt = self.logger.last()
        self.assertTrue(hasattr(evt, "function_name"),
                        "CoercionEvent must have a 'function_name' field")

    def test_module_is_non_empty_string(self):
        self.logger.record_mismatch(value=[], expected_type="date")
        evt = self.logger.last()
        self.assertIsInstance(evt.module, str)
        self.assertGreater(len(evt.module), 0, "module must not be empty")
        self.assertNotEqual(evt.module, "<unknown>")

    def test_function_name_is_non_empty_string(self):
        self.logger.record_mismatch(value=[], expected_type="date")
        evt = self.logger.last()
        self.assertIsInstance(evt.function_name, str)
        self.assertGreater(len(evt.function_name), 0, "function_name must not be empty")

    def test_all_six_localization_fields_present(self):
        """module, function_name, field, value_repr, expected_type, received_type."""
        self.logger.record_mismatch(
            value="BAD", expected_type="number", result=0, field="item.precio",
        )
        evt = self.logger.last()
        self.assertIsNotNone(evt.module)
        self.assertIsNotNone(evt.function_name)
        self.assertIsNotNone(evt.field)
        self.assertIsNotNone(evt.value_repr)
        self.assertIsNotNone(evt.expected_type)
        self.assertIsNotNone(evt.received_type)

    def test_field_localization_matches_kwarg(self):
        self.logger.record_mismatch(
            value="x", expected_type="number", field="totales.total",
        )
        evt = self.logger.last()
        self.assertEqual(evt.field, "totales.total")

    def test_expected_type_localization(self):
        self.logger.record_mismatch(value="x", expected_type="date")
        evt = self.logger.last()
        self.assertEqual(evt.expected_type, "date")

    def test_received_type_localization(self):
        self.logger.record_mismatch(value="x", expected_type="number")
        evt = self.logger.last()
        self.assertEqual(evt.received_type, "str")


class TestToNumLocalization(unittest.TestCase):
    """to_num failure must emit a fully-localized event."""

    def setUp(self):
        from reportforge.core.render.expressions.coercion_logger import coercion_logger
        self.gl = coercion_logger
        self.gl.enable()
        self.gl.clear()

    def tearDown(self):
        self.gl.disable()
        self.gl.clear()

    def test_to_num_event_has_module(self):
        to_num("NOT_A_NUM")
        evt = self.gl.last()
        self.assertIsNotNone(evt)
        self.assertIsInstance(evt.module, str)
        self.assertGreater(len(evt.module), 0)

    def test_to_num_event_has_function_name(self):
        to_num("NOT_A_NUM")
        evt = self.gl.last()
        self.assertIsNotNone(evt)
        self.assertIsInstance(evt.function_name, str)
        self.assertGreater(len(evt.function_name), 0)

    def test_to_num_event_value_repr_contains_bad_value(self):
        to_num("LOCALIZE_ME")
        evt = self.gl.last()
        self.assertIn("LOCALIZE_ME", evt.value_repr)

    def test_to_num_event_expected_type_is_number(self):
        to_num("BAD")
        evt = self.gl.last()
        self.assertEqual(evt.expected_type, "number")

    def test_to_num_event_received_type_is_str(self):
        to_num("BAD")
        evt = self.gl.last()
        self.assertEqual(evt.received_type, "str")

    def test_to_num_localization_is_reproducible(self):
        """Same bad input must produce same module+function_name on repeat calls."""
        to_num("REPEAT_ME")
        to_num("REPEAT_ME")
        evts = self.gl.events()
        self.assertGreaterEqual(len(evts), 2)
        self.assertEqual(evts[-1].module, evts[-2].module)
        self.assertEqual(evts[-1].function_name, evts[-2].function_name)
        self.assertEqual(evts[-1].expected_type, evts[-2].expected_type)


class TestParseDateLocalization(unittest.TestCase):
    """parse_date failure must emit a fully-localized event."""

    def setUp(self):
        from reportforge.core.render.expressions.coercion_logger import coercion_logger
        self.gl = coercion_logger
        self.gl.enable()
        self.gl.clear()

    def tearDown(self):
        self.gl.disable()
        self.gl.clear()

    def test_parse_date_event_has_module(self):
        parse_date("not-a-date-99/99/9999")
        evt = self.gl.last()
        self.assertIsNotNone(evt)
        self.assertIsInstance(evt.module, str)
        self.assertGreater(len(evt.module), 0)

    def test_parse_date_event_has_function_name(self):
        parse_date("not-a-date-99/99/9999")
        evt = self.gl.last()
        self.assertIsNotNone(evt)
        self.assertIsInstance(evt.function_name, str)
        self.assertGreater(len(evt.function_name), 0)

    def test_parse_date_event_expected_type_is_date(self):
        parse_date("BADDATE")
        evt = self.gl.last()
        self.assertEqual(evt.expected_type, "date")


class TestCoerceMapLocalization(unittest.TestCase):
    """coerce() with explicit logger must log fully-localized event."""

    def setUp(self):
        self.logger = CoercionLogger()
        self.logger.enable()

    def tearDown(self):
        self.logger.disable()
        self.logger.clear()

    def test_coerce_number_mismatch_has_field(self):
        coerce("abc", "number", field="item.precio", logger=self.logger)
        evt = self.logger.last()
        self.assertIsNotNone(evt)
        self.assertEqual(evt.field, "item.precio")

    def test_coerce_number_mismatch_has_expected_type(self):
        coerce("abc", "number", field="item.precio", logger=self.logger)
        evt = self.logger.last()
        self.assertEqual(evt.expected_type, "number")

    def test_coerce_number_mismatch_has_received_type(self):
        coerce("abc", "number", field="item.precio", logger=self.logger)
        evt = self.logger.last()
        self.assertEqual(evt.received_type, "str")

    def test_coerce_number_mismatch_value_repr_contains_value(self):
        coerce("XYZW", "number", field="item.precio", logger=self.logger)
        evt = self.logger.last()
        self.assertIn("XYZW", evt.value_repr)

    def test_coerce_date_mismatch_has_field(self):
        coerce("not-a-date", "date", field="meta.fecha", logger=self.logger)
        evt = self.logger.last()
        self.assertIsNotNone(evt)
        self.assertEqual(evt.field, "meta.fecha")
        self.assertEqual(evt.expected_type, "date")


class TestRenderEngineErrorLocalization(unittest.TestCase):
    """RenderEngineError messages must name the specific failure context."""

    def setUp(self):
        from reportforge.core.render.render_engine import RenderEngineError
        self.RenderEngineError = RenderEngineError

    def _render(self, data):
        from reportforge.core.render.render_engine import RenderEngine
        RenderEngine(debug=True).render_html(data)

    def test_missing_meta_error_names_meta(self):
        data = deepcopy(_BASE)
        del data["meta"]
        with self.assertRaises(self.RenderEngineError) as ctx:
            self._render(data)
        self.assertIn("meta", str(ctx.exception).lower())

    def test_missing_empresa_error_names_empresa(self):
        data = deepcopy(_BASE)
        del data["empresa"]
        with self.assertRaises(self.RenderEngineError) as ctx:
            self._render(data)
        self.assertIn("empresa", str(ctx.exception).lower())

    def test_missing_items_error_names_items(self):
        data = deepcopy(_BASE)
        del data["items"]
        with self.assertRaises(self.RenderEngineError) as ctx:
            self._render(data)
        self.assertIn("items", str(ctx.exception).lower())

    def test_non_dict_root_error_is_specific(self):
        with self.assertRaises(self.RenderEngineError) as ctx:
            self._render([])
        msg = str(ctx.exception)
        self.assertGreater(len(msg), 5, "error message must not be empty")
        # Must not be a bare generic message
        self.assertNotIn("invalid value", msg.lower())
        self.assertNotIn("error occurred", msg.lower())

    def test_items_not_list_error_names_items(self):
        data = deepcopy(_BASE)
        data["items"] = "not-a-list"
        with self.assertRaises(self.RenderEngineError) as ctx:
            self._render(data)
        self.assertIn("items", str(ctx.exception).lower())


if __name__ == "__main__":
    unittest.main()
