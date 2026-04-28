"""
test_error_snapshot.py — Error message stability and specificity tests.

Error messages must be:
  - Stable: same input → same message text
  - Specific: name the field/section/type that failed
  - Useful: contain enough context to act without reading source
  - Non-generic: never just "invalid value" or "error occurred"

Coverage:
  1. RenderEngineError messages name the missing key.
  2. ValueError from coerce() names the unknown type.
  3. Error messages do not contain banned generic phrases.
  4. Same failure produces same error message on repeat calls.
  5. CoercionEvent.value_repr is bounded (no unbounded data dumps).
  6. Error for items-not-list names "items" and describes the problem.
"""
from __future__ import annotations

import unittest
from copy import deepcopy

from reportforge.core.render.expressions.coercion_map import coerce

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

# Phrases banned from all error messages
_BANNED_PHRASES = [
    "invalid value",
    "error occurred",
    "an error",
    "something went wrong",
    "unknown error",
    "unexpected error",
]


def _engine():
    from reportforge.core.render.render_engine import RenderEngine
    return RenderEngine(debug=True)


class TestRenderEngineErrorMessages(unittest.TestCase):
    """RenderEngineError messages must be specific and stable."""

    def setUp(self):
        from reportforge.core.render.render_engine import RenderEngineError
        self.Err = RenderEngineError

    def _render(self, data):
        _engine().render_html(data)

    def _get_error_msg(self, data) -> str:
        with self.assertRaises(self.Err) as ctx:
            self._render(data)
        return str(ctx.exception)

    def test_missing_meta_names_meta(self):
        data = deepcopy(_BASE)
        del data["meta"]
        msg = self._get_error_msg(data)
        self.assertIn("meta", msg.lower(),
                      f"Error for missing 'meta' must name 'meta'. Got: {msg!r}")

    def test_missing_empresa_names_empresa(self):
        data = deepcopy(_BASE)
        del data["empresa"]
        msg = self._get_error_msg(data)
        self.assertIn("empresa", msg.lower())

    def test_missing_cliente_names_cliente(self):
        data = deepcopy(_BASE)
        del data["cliente"]
        msg = self._get_error_msg(data)
        self.assertIn("cliente", msg.lower())

    def test_missing_fiscal_names_fiscal(self):
        data = deepcopy(_BASE)
        del data["fiscal"]
        msg = self._get_error_msg(data)
        self.assertIn("fiscal", msg.lower())

    def test_missing_items_names_items(self):
        data = deepcopy(_BASE)
        del data["items"]
        msg = self._get_error_msg(data)
        self.assertIn("items", msg.lower())

    def test_missing_totales_names_totales(self):
        data = deepcopy(_BASE)
        del data["totales"]
        msg = self._get_error_msg(data)
        self.assertIn("totales", msg.lower())

    def test_items_not_list_names_items(self):
        data = deepcopy(_BASE)
        data["items"] = "not-a-list"
        msg = self._get_error_msg(data)
        self.assertIn("items", msg.lower())

    def test_non_dict_root_is_not_generic(self):
        with self.assertRaises(self.Err) as ctx:
            self._render([])
        msg = str(ctx.exception)
        self.assertGreater(len(msg), 5)
        for phrase in _BANNED_PHRASES:
            self.assertNotIn(phrase, msg.lower(),
                             f"Error message contains banned phrase {phrase!r}: {msg!r}")

    def test_error_messages_contain_no_banned_phrases(self):
        """All 6 required-key errors must be free of generic phrases."""
        for key in ("meta", "empresa", "cliente", "fiscal", "items", "totales"):
            data = deepcopy(_BASE)
            del data[key]
            msg = self._get_error_msg(data)
            for phrase in _BANNED_PHRASES:
                self.assertNotIn(phrase, msg.lower(),
                                 f"Missing {key!r} error contains banned phrase {phrase!r}")

    def test_missing_key_error_is_stable_across_calls(self):
        """Same missing key must produce same error message on repeat calls."""
        data1 = deepcopy(_BASE)
        data2 = deepcopy(_BASE)
        del data1["meta"]
        del data2["meta"]
        msg1 = self._get_error_msg(data1)
        msg2 = self._get_error_msg(data2)
        self.assertEqual(msg1, msg2,
                         "Same failure must produce identical error message")

    def test_error_message_minimum_length(self):
        """Error messages must carry enough content to be actionable."""
        data = deepcopy(_BASE)
        del data["meta"]
        msg = self._get_error_msg(data)
        self.assertGreaterEqual(len(msg), 15,
                                f"Error message too short to be useful: {msg!r}")


class TestCoercionMapErrorMessages(unittest.TestCase):
    """coerce() ValueError for unknown type must be specific."""

    def test_unknown_type_error_names_the_type(self):
        with self.assertRaises(ValueError) as ctx:
            coerce("x", "unknown_type_xyz")
        msg = str(ctx.exception)
        self.assertIn("unknown_type_xyz", msg,
                      f"ValueError must name the unknown type. Got: {msg!r}")

    def test_unknown_type_error_is_not_generic(self):
        with self.assertRaises(ValueError) as ctx:
            coerce("x", "bad_type")
        msg = str(ctx.exception)
        for phrase in _BANNED_PHRASES:
            self.assertNotIn(phrase, msg.lower(),
                             f"coerce() ValueError contains banned phrase {phrase!r}")

    def test_unknown_type_error_is_stable(self):
        """Same bad type must produce same error text."""
        msgs = []
        for _ in range(3):
            with self.assertRaises(ValueError) as ctx:
                coerce("x", "repeatable_bad_type")
            msgs.append(str(ctx.exception))
        self.assertEqual(msgs[0], msgs[1])
        self.assertEqual(msgs[1], msgs[2])

    def test_unknown_type_error_suggests_registration(self):
        """Error should hint at the fix: register the type."""
        with self.assertRaises(ValueError) as ctx:
            coerce("x", "unregistered")
        msg = str(ctx.exception)
        # Must contain enough context that a developer knows what to do
        self.assertTrue(
            any(word in msg.lower() for word in
                ("register", "coercion_map", "unknown", "target")),
            f"Error message must be actionable. Got: {msg!r}",
        )


class TestCoercionEventValueReprBound(unittest.TestCase):
    """CoercionEvent.value_repr must be bounded — no unbounded data dumps."""

    def setUp(self):
        from reportforge.core.render.expressions.coercion_logger import CoercionLogger
        self.logger = CoercionLogger()
        self.logger.enable()

    def tearDown(self):
        self.logger.disable()
        self.logger.clear()

    def test_value_repr_bounded_at_200_chars(self):
        huge_value = "x" * 1000
        self.logger.record_mismatch(value=huge_value, expected_type="number")
        evt = self.logger.last()
        self.assertLessEqual(len(evt.value_repr), 200,
                             "value_repr must be bounded to 200 chars")

    def test_result_repr_bounded_at_200_chars(self):
        huge_result = "y" * 1000
        self.logger.record_mismatch(value="x", expected_type="number",
                                    result=huge_result)
        evt = self.logger.last()
        self.assertLessEqual(len(evt.result_repr), 200,
                             "result_repr must be bounded to 200 chars")

    def test_value_repr_contains_repr_of_value(self):
        self.logger.record_mismatch(value="test_val", expected_type="number")
        evt = self.logger.last()
        self.assertIn("test_val", evt.value_repr)


if __name__ == "__main__":
    unittest.main()
