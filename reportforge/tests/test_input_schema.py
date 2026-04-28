"""
test_input_schema.py — Input schema contract tests.

Validates that the render pipeline fails early and explicitly when required
fields are missing, wrong type, or structurally invalid — before any
rendering begins.

Coverage:
  - Required top-level keys (meta, empresa, cliente, fiscal, items, totales)
  - items must be a list
  - Field-level type expectations on canonical subfields
  - Null / missing optional subfields handled gracefully
  - Default values applied correctly when optional fields absent
"""
from __future__ import annotations

import unittest
from copy import deepcopy

# ---------------------------------------------------------------------------
# Minimal valid render payload — all tests mutate copies of this.
# ---------------------------------------------------------------------------
_BASE = {
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


def _engine():
    """Return a RenderEngine in debug mode (no PDF generation needed)."""
    from reportforge.core.render.render_engine import RenderEngine
    return RenderEngine(debug=True)


class TestRequiredTopLevelKeys(unittest.TestCase):
    """Missing required keys must raise RenderEngineError before rendering."""

    def setUp(self):
        from reportforge.core.render.render_engine import RenderEngineError
        self.RenderEngineError = RenderEngineError

    def _render(self, data):
        _engine().render_html(data)

    def test_missing_meta_raises(self):
        data = deepcopy(_BASE)
        del data["meta"]
        with self.assertRaises(self.RenderEngineError):
            self._render(data)

    def test_missing_empresa_raises(self):
        data = deepcopy(_BASE)
        del data["empresa"]
        with self.assertRaises(self.RenderEngineError):
            self._render(data)

    def test_missing_cliente_raises(self):
        data = deepcopy(_BASE)
        del data["cliente"]
        with self.assertRaises(self.RenderEngineError):
            self._render(data)

    def test_missing_fiscal_raises(self):
        data = deepcopy(_BASE)
        del data["fiscal"]
        with self.assertRaises(self.RenderEngineError):
            self._render(data)

    def test_missing_items_raises(self):
        data = deepcopy(_BASE)
        del data["items"]
        with self.assertRaises(self.RenderEngineError):
            self._render(data)

    def test_missing_totales_raises(self):
        data = deepcopy(_BASE)
        del data["totales"]
        with self.assertRaises(self.RenderEngineError):
            self._render(data)

    def test_non_dict_root_raises(self):
        with self.assertRaises(self.RenderEngineError):
            self._render([])

    def test_all_required_keys_present_does_not_raise(self):
        """Baseline: a valid payload must not raise."""
        try:
            _engine().render_html(deepcopy(_BASE))
        except self.RenderEngineError:
            self.fail("Valid payload raised RenderEngineError unexpectedly")


class TestItemsSchema(unittest.TestCase):
    """items must be a list; item entries should be dicts."""

    def setUp(self):
        from reportforge.core.render.render_engine import RenderEngineError
        self.RenderEngineError = RenderEngineError

    def _render(self, data):
        _engine().render_html(data)

    def test_items_not_list_raises(self):
        data = deepcopy(_BASE)
        data["items"] = {"key": "value"}  # dict instead of list
        with self.assertRaises(self.RenderEngineError):
            self._render(data)

    def test_items_string_raises(self):
        data = deepcopy(_BASE)
        data["items"] = "not a list"
        with self.assertRaises(self.RenderEngineError):
            self._render(data)

    def test_items_empty_list_does_not_raise(self):
        """Empty items list is a valid edge case — report with no detail rows."""
        data = deepcopy(_BASE)
        data["items"] = []
        try:
            self._render(data)
        except self.RenderEngineError:
            self.fail("Empty items list raised RenderEngineError unexpectedly")

    def test_items_with_null_fields_does_not_crash(self):
        """Items with null optional fields must not crash the renderer."""
        data = deepcopy(_BASE)
        data["items"] = [{"codigo": None, "descripcion": None, "cantidad": None,
                          "precio_unitario": None, "descuento": None, "subtotal": None}]
        try:
            self._render(data)
        except self.RenderEngineError:
            self.fail("Null item fields raised RenderEngineError unexpectedly")


class TestFieldTypeExpectations(unittest.TestCase):
    """Canonical field types should be coerceable without crashing."""

    def _resolve(self, path, data=None):
        from reportforge.core.render.resolvers.field_resolver import FieldResolver
        resolver = FieldResolver(data or deepcopy(_BASE))
        return resolver.get(path)

    def test_meta_doc_num_is_string(self):
        val = self._resolve("meta.doc_num")
        self.assertIsInstance(val, str)

    def test_totales_total_is_numeric(self):
        val = self._resolve("totales.total")
        self.assertIsInstance(val, (int, float))
        self.assertGreater(float(val), 0)

    def test_items_cantidad_is_numeric(self):
        from reportforge.core.render.resolvers.field_resolver import FieldResolver
        data = deepcopy(_BASE)
        resolver = FieldResolver(data, item=data["items"][0])
        val = resolver.get("item.cantidad")
        self.assertIsInstance(val, (int, float))

    def test_empresa_razon_social_is_string(self):
        val = self._resolve("empresa.razon_social")
        self.assertIsInstance(val, str)
        self.assertTrue(len(val) > 0)

    def test_missing_optional_field_returns_default(self):
        """A missing optional field must return the default, not raise."""
        val = self._resolve("cliente.fax")  # not in base
        self.assertEqual(val, "")  # FieldResolver default is ""

    def test_numeric_string_in_cantidad_is_resolvable(self):
        """items.cantidad as string should still be usable as number via coercion."""
        from reportforge.core.render.expressions.type_coercion import to_num
        val = to_num("2")
        self.assertEqual(val, 2.0)


class TestNullability(unittest.TestCase):
    """Null values in non-required fields must not propagate as crashes."""

    def test_none_empresa_email_returns_empty(self):
        from reportforge.core.render.resolvers.field_resolver import FieldResolver
        data = deepcopy(_BASE)
        data["empresa"]["email"] = None
        resolver = FieldResolver(data)
        val = resolver.get("empresa.email")
        # None traversal returns the default ("")
        self.assertEqual(val, "")

    def test_none_totales_descuento_coerces_to_zero(self):
        from reportforge.core.render.expressions.type_coercion import to_num
        self.assertEqual(to_num(None), 0)

    def test_none_fecha_coerces_to_none_date(self):
        from reportforge.core.render.expressions.type_coercion import parse_date
        self.assertIsNone(parse_date(None))


class TestFormatValue(unittest.TestCase):
    """format_value must use only KNOWN_FORMATS and fall back gracefully."""

    def test_currency_format(self):
        from reportforge.core.render.resolvers.field_resolver import format_value
        self.assertEqual(format_value(1234.5, "currency"), "1,234.50")

    def test_date_format(self):
        from reportforge.core.render.resolvers.field_resolver import format_value
        self.assertEqual(format_value("2024-01-15", "date"), "15/01/2024")

    def test_unknown_format_falls_back_to_str(self):
        from reportforge.core.render.resolvers.field_resolver import format_value
        result = format_value(42, "nonexistent_format")
        self.assertEqual(result, "42")

    def test_invalid_numeric_in_currency_falls_back(self):
        from reportforge.core.render.resolvers.field_resolver import format_value
        result = format_value("not-a-number", "currency")
        # Must not raise — falls back to str(value)
        self.assertIsInstance(result, str)

    def test_known_formats_all_defined_in_map(self):
        """Every format in KNOWN_FORMATS must be handled by format_value."""
        from reportforge.core.render.resolvers.field_resolver import format_value
        from reportforge.core.render.expressions.coercion_map import KNOWN_FORMATS
        # Quick smoke: format_value must not raise for any known format
        # Use a neutral value (string "1") that most formatters can handle
        for fmt in KNOWN_FORMATS:
            try:
                result = format_value("1", fmt)
                self.assertIsInstance(result, str,
                    f"format_value('1', {fmt!r}) returned non-string: {result!r}")
            except Exception as e:
                self.fail(f"format_value raised for known format {fmt!r}: {e}")


if __name__ == "__main__":
    unittest.main()
