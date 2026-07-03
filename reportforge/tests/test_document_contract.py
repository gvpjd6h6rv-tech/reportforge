"""Tests for core.contracts.document_contract — the pure declaration module.

Single responsibility: verify the contract DECLARATION is well-formed and covers
the keys the shipped layouts require. Runs without SAP, WeasyPrint or backends.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.contracts.document_contract import (  # noqa: E402
    DOCUMENT_CONTRACTS,
    FACTURA_ROOT_KEYS,
    FACTURA_ITEM_KEYS,
    GUIA_ROOT_KEYS,
    GUIA_ITEM_KEYS,
    contract_for,
)

_ENGINE_SPECIAL = {
    "RecordNumber", "PrintTime", "PrintDate",
    "PageNumber", "TotalPages", "GroupNumber", "PageNofM",
}


class TestDocumentContractShape(unittest.TestCase):
    def test_exactly_two_doc_types_declared(self):
        self.assertEqual(set(DOCUMENT_CONTRACTS), {"factura", "guia"})

    def test_each_type_has_root_and_item_frozensets(self):
        for doc_type, contract in DOCUMENT_CONTRACTS.items():
            self.assertEqual(set(contract), {"root", "item"}, doc_type)
            self.assertIsInstance(contract["root"], frozenset, doc_type)
            self.assertIsInstance(contract["item"], frozenset, doc_type)
            self.assertTrue(contract["root"], f"{doc_type} root is empty")
            self.assertTrue(contract["item"], f"{doc_type} item is empty")

    def test_all_keys_are_nonempty_strings(self):
        for doc_type, contract in DOCUMENT_CONTRACTS.items():
            for key in contract["root"] | contract["item"]:
                self.assertIsInstance(key, str, f"{doc_type}:{key!r}")
                self.assertTrue(key.strip(), f"{doc_type}: blank key {key!r}")

    def test_item_keys_are_bare_no_item_prefix(self):
        for doc_type, contract in DOCUMENT_CONTRACTS.items():
            for key in contract["item"]:
                self.assertFalse(
                    key.startswith("item."),
                    f"{doc_type}: item key must be bare, got {key!r}",
                )

    def test_no_engine_special_fields_in_any_contract(self):
        for doc_type, contract in DOCUMENT_CONTRACTS.items():
            leaked = (contract["root"] | contract["item"]) & _ENGINE_SPECIAL
            self.assertEqual(leaked, set(), f"{doc_type} leaks special fields: {leaked}")


class TestFacturaContract(unittest.TestCase):
    def test_gross_iva_display_keys_present(self):
        self.assertLessEqual(
            {"meta_invoice_number", "meta_doc_total",
             "totales_subtotal_con_iva", "totales_descuento_display"},
            FACTURA_ROOT_KEYS,
        )
        self.assertLessEqual(
            {"precio_unitario_con_iva", "precio_total_con_iva"},
            FACTURA_ITEM_KEYS,
        )

    def test_fv1_net_fiscal_keys_preserved(self):
        # The superset must NOT drop what FV1 (fiscal) binds.
        self.assertLessEqual(
            {"totales_valor_total", "totales_subtotal_sin_impuestos",
             "fiscal_numero_documento"},
            FACTURA_ROOT_KEYS,
        )
        self.assertLessEqual({"precio_unitario", "subtotal"}, FACTURA_ITEM_KEYS)

    def test_fv1_barcode_bound_key_present(self):
        # fiscal_clave_acceso is bound by a barcode element (not a field
        # element) in factura_a4_fv1.json — easy to miss with a type=="field"
        # only audit; regression-guard it explicitly.
        self.assertIn("fiscal_clave_acceso", FACTURA_ROOT_KEYS)


class TestGuiaContract(unittest.TestCase):
    def test_referencia_item_key_present(self):
        # The gap that left item.referencia empty must be part of the contract.
        self.assertIn("referencia", GUIA_ITEM_KEYS)

    def test_traslado_and_destinatario_keys_present(self):
        self.assertLessEqual(
            {"traslado_motivo", "traslado_ruta", "destinatario_razon_social"},
            GUIA_ROOT_KEYS,
        )


class TestContractAccessor(unittest.TestCase):
    def test_returns_declared_contract_object(self):
        self.assertIs(contract_for("factura"), DOCUMENT_CONTRACTS["factura"])
        self.assertIs(contract_for("guia"), DOCUMENT_CONTRACTS["guia"])

    def test_unknown_doc_type_raises_keyerror_listing_known(self):
        with self.assertRaises(KeyError) as ctx:
            contract_for("desconocido")
        self.assertIn("factura", str(ctx.exception))
        self.assertIn("guia", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
