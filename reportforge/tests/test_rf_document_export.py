"""Tests for scripts.rf_document_export — RF's own live-document export wiring.

Single responsibility: verify build_factura_a4_payload_from_rf /
build_guia_a4_payload_from_rf correctly chain
build_invoice_model/build_remision_model -> adapt_rf_* -> normalize_* , and
that render_*_from_rf pass the resulting payload through unchanged to the
shared renderer (operational_docs.render_document_pdf/html — not touched,
just monkeypatched here to avoid a real PDF render). No SAP/DB access.
"""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from reportforge.scripts import rf_document_export as export  # noqa: E402
from reportforge.core.contracts.document_contract import (  # noqa: E402
    FACTURA_ROOT_KEYS, FACTURA_ITEM_KEYS, GUIA_ROOT_KEYS, GUIA_ITEM_KEYS,
)


def _fake_invoice_model() -> dict:
    return {
        "meta": {"doc_entry": 1, "doc_num": 9501},
        "empresa": {"razon_social": "MI EMPRESA RF"},
        "cliente": {"razon_social": "HUANG XIRU", "nombre": "HUANG XIRU"},
        "fiscal": {},
        "pago": {}, "forma_pago": {},
        "observaciones": "1 FUNDA",
        "nota_numero": "000009501",
        "valor_total": 106.41,
        "items": [{"codigo": "A1", "descripcion": "D", "cantidad": 1.0, "precio_unitario": 2.6}],
        "totales": {},
    }


def _fake_remision_model() -> dict:
    return {
        "meta": {"doc_entry": 1, "doc_num": 9501},
        "empresa": {"razon_social": "MI EMPRESA RF"},
        "destinatario": {"razon_social": "HUANG XIRU"},
        "fiscal": {}, "traslado": {"motivo": "VENTA"}, "origen": {}, "destino": {},
        "items": [{"codigo": "A1", "descripcion": "D", "cantidad": 1.0, "unidad_medida": "UND", "referencia": None}],
        "observaciones": None,
    }


class TestBuildFacturaPayloadFromRf(unittest.TestCase):
    def test_chains_build_invoice_model_into_full_contract_payload(self):
        with mock.patch.object(export, "build_invoice_model", return_value=_fake_invoice_model()) as m:
            payload = export.build_factura_a4_payload_from_rf(9501, datasource_alias="sap_b1_linux")
        m.assert_called_once_with(9501, datasource_alias="sap_b1_linux")
        self.assertEqual(FACTURA_ROOT_KEYS - set(payload), set())
        self.assertEqual(FACTURA_ITEM_KEYS - set(payload["items"][0]), set())
        self.assertEqual(payload["cliente_razon_social"], "HUANG XIRU")
        self.assertEqual(payload["meta_invoice_number"], "000009501")


class TestBuildGuiaPayloadFromRf(unittest.TestCase):
    def test_chains_build_remision_model_into_full_contract_payload(self):
        with mock.patch.object(export, "build_remision_model", return_value=_fake_remision_model()) as m:
            payload = export.build_guia_a4_payload_from_rf(9501, datasource_alias="sap_b1_linux")
        m.assert_called_once_with(9501, datasource_alias="sap_b1_linux")
        self.assertEqual(GUIA_ROOT_KEYS - set(payload), set())
        for item in payload["items"]:
            self.assertEqual(GUIA_ITEM_KEYS - set(item), set())
        self.assertEqual(payload["destinatario_razon_social"], "HUANG XIRU")
        self.assertEqual(payload["traslado_motivo"], "VENTA")


class TestRenderersPassPayloadThroughToSharedRenderer(unittest.TestCase):
    def test_render_factura_a4_pdf_from_rf_calls_shared_renderer(self):
        with mock.patch.object(export, "build_invoice_model", return_value=_fake_invoice_model()), \
             mock.patch.object(export, "render_document_pdf", return_value=b"%PDF-1.4 fake") as rp:
            result = export.render_factura_a4_pdf_from_rf(9501, layout_path="/tmp/factura_a4_fv2.json")
        self.assertEqual(result, b"%PDF-1.4 fake")
        args, kwargs = rp.call_args
        self.assertEqual(args[0], "factura_a4")
        self.assertEqual(kwargs["layout_path"], "/tmp/factura_a4_fv2.json")
        self.assertEqual(args[1]["cliente_razon_social"], "HUANG XIRU")

    def test_render_guia_a4_pdf_from_rf_calls_shared_renderer(self):
        with mock.patch.object(export, "build_remision_model", return_value=_fake_remision_model()), \
             mock.patch.object(export, "render_document_pdf", return_value=b"%PDF-1.4 fake") as rp:
            result = export.render_guia_a4_pdf_from_rf(9501, layout_path="/tmp/guia_remision_fv2.json")
        self.assertEqual(result, b"%PDF-1.4 fake")
        args, kwargs = rp.call_args
        self.assertEqual(args[0], "guia_remision_a4")
        self.assertEqual(kwargs["layout_path"], "/tmp/guia_remision_fv2.json")
        self.assertEqual(args[1]["destinatario_razon_social"], "HUANG XIRU")


if __name__ == "__main__":
    unittest.main()
