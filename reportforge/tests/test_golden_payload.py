"""
test_golden_payload.py — Golden snapshot tests for critical payloads.

Any change to resolved field values, formatted outputs, or nullability
behavior for the canonical payload must be explicit: update the golden
file and document why.

Run with UPDATE_GOLDEN=1 to regenerate:
    UPDATE_GOLDEN=1 python -m pytest reportforge/tests/test_golden_payload.py

Coverage:
  1. All resolved field values match golden.
  2. All formatted field values match golden.
  3. Nullability defaults match golden.
  4. Item-level fields match golden.
  5. Golden file itself is valid JSON with required sections.
  6. Regression: adding a key to data does not break existing golden fields.
"""
from __future__ import annotations

import json
import os
import unittest
from copy import deepcopy
from pathlib import Path

from reportforge.core.render.resolvers.field_resolver import FieldResolver, format_value

GOLDEN_PATH = Path(__file__).parent / "golden" / "factura_simple.golden.json"

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


def _load_golden() -> dict:
    with open(GOLDEN_PATH, encoding="utf-8") as f:
        return json.load(f)


def _build_current() -> dict:
    """Compute current resolved values from live code — matches golden structure."""
    data = deepcopy(_BASE)
    resolver = FieldResolver(data)
    item_resolver = resolver.with_item(data["items"][0])

    resolved = {}
    for path in [
        "meta.doc_num", "meta.doc_type", "meta.fecha_emision",
        "empresa.razon_social", "empresa.ruc", "empresa.direccion_matriz",
        "cliente.razon_social", "cliente.identificacion", "cliente.email",
        "fiscal.ambiente", "fiscal.tipo_emision",
        "totales.subtotal", "totales.iva_12", "totales.total",
    ]:
        resolved[path] = resolver.get(path)

    item_fields = {}
    for path in [
        "item.codigo", "item.descripcion", "item.cantidad",
        "item.precio_unitario", "item.descuento", "item.subtotal",
    ]:
        item_fields[path] = item_resolver.get(path)

    formatted = {
        "totales.total|currency":    format_value(resolver.get("totales.total"), "currency"),
        "totales.subtotal|currency": format_value(resolver.get("totales.subtotal"), "currency"),
        "totales.iva_12|currency":   format_value(resolver.get("totales.iva_12"), "currency"),
        "meta.fecha_emision|date":   format_value(resolver.get("meta.fecha_emision"), "date"),
    }

    nullability = {
        "empresa.email":    resolver.get("empresa.email"),
        "cliente.fax":      resolver.get("cliente.fax"),
        "meta.nonexistent": resolver.get("meta.nonexistent"),
    }

    return {
        "resolved_fields": resolved,
        "item_fields":     item_fields,
        "formatted_fields": formatted,
        "nullability":     nullability,
    }


class TestGoldenFileIntegrity(unittest.TestCase):
    """Golden file must exist and have required sections."""

    def test_golden_file_exists(self):
        self.assertTrue(GOLDEN_PATH.exists(),
                        f"Golden file missing: {GOLDEN_PATH}")

    def test_golden_file_is_valid_json(self):
        golden = _load_golden()
        self.assertIsInstance(golden, dict)

    def test_golden_has_resolved_fields_section(self):
        golden = _load_golden()
        self.assertIn("resolved_fields", golden)
        self.assertIsInstance(golden["resolved_fields"], dict)

    def test_golden_has_item_fields_section(self):
        golden = _load_golden()
        self.assertIn("item_fields", golden)
        self.assertIsInstance(golden["item_fields"], dict)

    def test_golden_has_formatted_fields_section(self):
        golden = _load_golden()
        self.assertIn("formatted_fields", golden)
        self.assertIsInstance(golden["formatted_fields"], dict)

    def test_golden_has_nullability_section(self):
        golden = _load_golden()
        self.assertIn("nullability", golden)
        self.assertIsInstance(golden["nullability"], dict)


class TestGoldenResolvedFields(unittest.TestCase):
    """Resolved field values must exactly match golden snapshot."""

    @classmethod
    def setUpClass(cls):
        cls.golden = _load_golden()
        cls.current = _build_current()

        if os.getenv("UPDATE_GOLDEN"):
            with open(GOLDEN_PATH, "w", encoding="utf-8") as f:
                merged = dict(cls.golden)
                merged.update(cls.current)
                merged["version"] = cls.golden.get("version", "1.0")
                merged["description"] = cls.golden.get("description", "")
                json.dump(merged, f, indent=2, ensure_ascii=False)
            print(f"\n[UPDATE_GOLDEN] Wrote {GOLDEN_PATH}")

    def _check(self, section: str, key: str):
        golden_val = self.golden[section][key]
        current_val = self.current[section][key]
        self.assertEqual(
            current_val, golden_val,
            f"{section}[{key!r}] changed: golden={golden_val!r} current={current_val!r}\n"
            f"To accept change: UPDATE_GOLDEN=1 python -m pytest {__file__}",
        )

    def test_meta_doc_num(self):
        self._check("resolved_fields", "meta.doc_num")

    def test_meta_doc_type(self):
        self._check("resolved_fields", "meta.doc_type")

    def test_meta_fecha_emision(self):
        self._check("resolved_fields", "meta.fecha_emision")

    def test_empresa_razon_social(self):
        self._check("resolved_fields", "empresa.razon_social")

    def test_empresa_ruc(self):
        self._check("resolved_fields", "empresa.ruc")

    def test_cliente_razon_social(self):
        self._check("resolved_fields", "cliente.razon_social")

    def test_totales_subtotal(self):
        self._check("resolved_fields", "totales.subtotal")

    def test_totales_iva_12(self):
        self._check("resolved_fields", "totales.iva_12")

    def test_totales_total(self):
        self._check("resolved_fields", "totales.total")


class TestGoldenItemFields(unittest.TestCase):
    """Item-level resolved fields must exactly match golden snapshot."""

    @classmethod
    def setUpClass(cls):
        cls.golden = _load_golden()
        cls.current = _build_current()

    def _check(self, key: str):
        golden_val = self.golden["item_fields"][key]
        current_val = self.current["item_fields"][key]
        self.assertEqual(
            current_val, golden_val,
            f"item_fields[{key!r}] changed: golden={golden_val!r} current={current_val!r}\n"
            f"To accept change: UPDATE_GOLDEN=1 python -m pytest {__file__}",
        )

    def test_item_codigo(self):
        self._check("item.codigo")

    def test_item_descripcion(self):
        self._check("item.descripcion")

    def test_item_cantidad(self):
        self._check("item.cantidad")

    def test_item_precio_unitario(self):
        self._check("item.precio_unitario")

    def test_item_subtotal(self):
        self._check("item.subtotal")


class TestGoldenFormattedFields(unittest.TestCase):
    """Formatted field outputs must exactly match golden snapshot."""

    @classmethod
    def setUpClass(cls):
        cls.golden = _load_golden()
        cls.current = _build_current()

    def _check(self, key: str):
        golden_val = self.golden["formatted_fields"][key]
        current_val = self.current["formatted_fields"][key]
        self.assertEqual(
            current_val, golden_val,
            f"formatted_fields[{key!r}] changed: "
            f"golden={golden_val!r} current={current_val!r}\n"
            f"To accept change: UPDATE_GOLDEN=1 python -m pytest {__file__}",
        )

    def test_total_currency(self):
        self._check("totales.total|currency")

    def test_subtotal_currency(self):
        self._check("totales.subtotal|currency")

    def test_iva_currency(self):
        self._check("totales.iva_12|currency")

    def test_fecha_emision_date(self):
        self._check("meta.fecha_emision|date")


class TestGoldenNullability(unittest.TestCase):
    """Missing/null fields must return documented defaults."""

    @classmethod
    def setUpClass(cls):
        cls.golden = _load_golden()
        cls.current = _build_current()

    def _check(self, key: str):
        golden_val = self.golden["nullability"][key]
        current_val = self.current["nullability"][key]
        self.assertEqual(
            current_val, golden_val,
            f"nullability[{key!r}] changed: golden={golden_val!r} current={current_val!r}\n"
            f"To accept change: UPDATE_GOLDEN=1 python -m pytest {__file__}",
        )

    def test_missing_empresa_email(self):
        self._check("empresa.email")

    def test_missing_cliente_fax(self):
        self._check("cliente.fax")

    def test_missing_meta_nonexistent(self):
        self._check("meta.nonexistent")

    def test_adding_extra_key_does_not_break_golden(self):
        """Extra keys in payload must not change existing resolved values."""
        data = deepcopy(_BASE)
        data["extra_section"] = {"foo": "bar"}
        resolver = FieldResolver(data)
        # Golden values must still be correct
        golden = _load_golden()
        self.assertEqual(
            resolver.get("totales.total"),
            golden["resolved_fields"]["totales.total"],
        )


if __name__ == "__main__":
    unittest.main()
