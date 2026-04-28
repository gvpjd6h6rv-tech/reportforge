"""
test_round_trip.py — Round-trip integrity tests.

Pipeline: input → FieldResolver → format_value → output

Verifies that traversing the pipeline preserves:
  - Fields: all paths resolvable after construction
  - Types: numeric fields remain numeric, strings remain strings
  - Nullability: None/missing fields return documented default, not crash
  - Isolation: with_item() does not mutate parent resolver
  - Idempotency: resolving same path twice returns same value
  - Item iteration: each item row gets its own isolated context

No rendering to PDF — tests the data resolution layer in isolation.
"""
from __future__ import annotations

import copy
import datetime
import unittest
from copy import deepcopy

from reportforge.core.render.resolvers.field_resolver import FieldResolver, format_value
from reportforge.core.render.expressions.type_coercion import to_num, parse_date


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
            "descripcion": "Producto Alpha",
            "cantidad": 2,
            "precio_unitario": 10.50,
            "descuento": 0.0,
            "subtotal": 21.00,
        },
        {
            "codigo": "P002",
            "descripcion": "Producto Beta",
            "cantidad": 3,
            "precio_unitario": 5.00,
            "descuento": 1.50,
            "subtotal": 13.50,
        },
    ],
    "totales": {
        "subtotal": 34.50,
        "descuento": 1.50,
        "iva_12": 3.96,
        "total": 36.96,
    },
}


class TestFieldPreservation(unittest.TestCase):
    """All critical paths must resolve to non-default values after round-trip."""

    def setUp(self):
        self.resolver = FieldResolver(deepcopy(_BASE))

    def test_meta_paths_preserved(self):
        for path in ("meta.doc_num", "meta.doc_type", "meta.fecha_emision"):
            val = self.resolver.get(path)
            self.assertNotEqual(val, "", f"{path} must not be empty after round-trip")
            self.assertIsNotNone(val, f"{path} must not be None after round-trip")

    def test_empresa_paths_preserved(self):
        for path in ("empresa.razon_social", "empresa.ruc"):
            val = self.resolver.get(path)
            self.assertNotEqual(val, "", f"{path} must not be empty after round-trip")

    def test_cliente_paths_preserved(self):
        for path in ("cliente.razon_social", "cliente.identificacion"):
            val = self.resolver.get(path)
            self.assertNotEqual(val, "", f"{path} must not be empty")

    def test_totales_paths_preserved(self):
        for path in ("totales.subtotal", "totales.iva_12", "totales.total"):
            val = self.resolver.get(path)
            self.assertIsNotNone(val, f"{path} must not be None")
            self.assertNotEqual(val, 0, f"{path} must not be 0")


class TestTypePreservation(unittest.TestCase):
    """Numeric fields must stay numeric; strings stay strings after round-trip."""

    def setUp(self):
        self.resolver = FieldResolver(deepcopy(_BASE))

    def test_numeric_totales_are_float_or_int(self):
        for path in ("totales.subtotal", "totales.iva_12", "totales.total"):
            val = self.resolver.get(path)
            self.assertIsInstance(val, (int, float),
                                  f"{path} must resolve to numeric, got {type(val).__name__}")

    def test_string_fields_are_str(self):
        for path in ("meta.doc_num", "meta.doc_type", "empresa.ruc",
                     "cliente.identificacion", "fiscal.ambiente"):
            val = self.resolver.get(path)
            self.assertIsInstance(val, str,
                                  f"{path} must resolve to str, got {type(val).__name__}")

    def test_to_num_round_trip_numeric_string(self):
        """A numeric string from input survives to_num without loss of value."""
        val = to_num("21.00")
        self.assertEqual(val, 21.0)
        self.assertIsInstance(val, float)

    def test_to_num_round_trip_integer(self):
        val = to_num(2)
        self.assertEqual(val, 2.0)
        self.assertIsInstance(val, float)

    def test_parse_date_round_trip_iso(self):
        """ISO date string → parse_date → date object preserves the date."""
        d = parse_date("2024-01-15")
        self.assertIsInstance(d, datetime.date)
        self.assertEqual(d.year, 2024)
        self.assertEqual(d.month, 1)
        self.assertEqual(d.day, 15)

    def test_format_value_currency_round_trip(self):
        """Numeric value → currency format → parseable string."""
        formatted = format_value(23.52, "currency")
        # Must be parseable back to float after stripping commas
        recovered = float(formatted.replace(",", ""))
        self.assertAlmostEqual(recovered, 23.52, places=2)

    def test_format_value_date_round_trip(self):
        """ISO date string → date format → parse back → same date."""
        formatted = format_value("2024-01-15", "date")
        self.assertEqual(formatted, "15/01/2024")
        # Parse back via parse_date
        d = parse_date(formatted)
        self.assertIsInstance(d, datetime.date)
        self.assertEqual(d.year, 2024)
        self.assertEqual(d.month, 1)
        self.assertEqual(d.day, 15)


class TestNullabilityPreservation(unittest.TestCase):
    """None/missing fields must return documented default — not crash or propagate None."""

    def setUp(self):
        data = deepcopy(_BASE)
        data["empresa"]["email"] = None  # explicit None
        self.resolver = FieldResolver(data)

    def test_explicit_none_field_returns_empty_string(self):
        val = self.resolver.get("empresa.email")
        self.assertEqual(val, "")

    def test_missing_field_returns_empty_string(self):
        val = self.resolver.get("cliente.fax")
        self.assertEqual(val, "")

    def test_missing_nested_field_returns_empty_string(self):
        val = self.resolver.get("meta.nonexistent_key")
        self.assertEqual(val, "")

    def test_none_totales_field_coerces_to_zero(self):
        val = to_num(None)
        self.assertEqual(val, 0)

    def test_none_date_returns_none(self):
        val = parse_date(None)
        self.assertIsNone(val)

    def test_format_value_with_empty_string_does_not_crash(self):
        result = format_value("", "currency")
        self.assertIsInstance(result, str)

    def test_format_value_with_none_does_not_crash(self):
        result = format_value(None, "currency")
        self.assertIsInstance(result, str)


class TestItemIsolation(unittest.TestCase):
    """with_item() must not mutate parent resolver; each item row is isolated."""

    def setUp(self):
        self.data = deepcopy(_BASE)
        self.resolver = FieldResolver(self.data)

    def test_with_item_does_not_mutate_parent(self):
        item = self.data["items"][0]
        child = self.resolver.with_item(item)

        # Mutate the child context indirectly by resolving item-specific path
        child.get("item.codigo")

        # Parent must still resolve top-level paths correctly
        self.assertEqual(self.resolver.get("totales.total"), 36.96)

    def test_each_item_gets_isolated_context(self):
        item0 = self.data["items"][0]
        item1 = self.data["items"][1]

        r0 = self.resolver.with_item(item0)
        r1 = self.resolver.with_item(item1)

        self.assertEqual(r0.get("item.codigo"), "P001")
        self.assertEqual(r1.get("item.codigo"), "P002")
        # Resolving one must not affect the other
        self.assertEqual(r0.get("item.cantidad"), 2)
        self.assertEqual(r1.get("item.cantidad"), 3)

    def test_item_subtotals_are_correct_per_row(self):
        subtotals = []
        for item in self.data["items"]:
            r = self.resolver.with_item(item)
            subtotals.append(r.get("item.subtotal"))
        self.assertEqual(subtotals[0], 21.00)
        self.assertEqual(subtotals[1], 13.50)

    def test_aggregation_covers_all_items(self):
        # agg_sum uses the raw item field name (no "item." prefix)
        total = self.resolver.agg_sum("subtotal")
        self.assertAlmostEqual(total, 34.50, places=2)


class TestResolutionIdempotency(unittest.TestCase):
    """Resolving the same path twice must return the same value."""

    def setUp(self):
        self.resolver = FieldResolver(deepcopy(_BASE))

    def test_resolve_same_path_twice_returns_same(self):
        paths = [
            "meta.doc_num", "empresa.razon_social",
            "totales.total", "fiscal.ambiente",
        ]
        for path in paths:
            v1 = self.resolver.get(path)
            v2 = self.resolver.get(path)
            self.assertEqual(v1, v2, f"{path}: second resolution differs from first")

    def test_format_value_idempotent_currency(self):
        v1 = format_value(23.52, "currency")
        v2 = format_value(23.52, "currency")
        self.assertEqual(v1, v2)

    def test_to_num_idempotent(self):
        self.assertEqual(to_num("42.5"), to_num("42.5"))

    def test_parse_date_idempotent(self):
        d1 = parse_date("2024-01-15")
        d2 = parse_date("2024-01-15")
        self.assertEqual(d1, d2)


class TestRoundTripWithNullItems(unittest.TestCase):
    """Items with null fields must complete the round-trip without crash."""

    def test_null_item_fields_do_not_crash_resolver(self):
        data = deepcopy(_BASE)
        data["items"] = [
            {"codigo": None, "descripcion": None, "cantidad": None,
             "precio_unitario": None, "descuento": None, "subtotal": None}
        ]
        resolver = FieldResolver(data)
        item_r = resolver.with_item(data["items"][0])
        for path in ("item.codigo", "item.descripcion", "item.cantidad",
                     "item.precio_unitario", "item.subtotal"):
            val = item_r.get(path)
            # Must return something — None is acceptable here (raw data pass-through)
            # Must not raise
            _ = val

    def test_null_numeric_item_field_coerces_safely(self):
        val = to_num(None)
        self.assertEqual(val, 0)

    def test_empty_items_list_resolves_aggregation_to_zero(self):
        data = deepcopy(_BASE)
        data["items"] = []
        resolver = FieldResolver(data)
        total = resolver.agg_sum("subtotal")
        self.assertEqual(total, 0)


if __name__ == "__main__":
    unittest.main()
