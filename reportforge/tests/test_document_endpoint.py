"""
test_document_endpoint.py

Tests contract-compliant para GET /document/{type}/{number}.
Scope: validación de path params, errores con contract/schemaVersion,
MAPPER_NOT_IMPLEMENTED, SCHEMA_MISMATCH.

No conexión real a SAP. No PreviewEngine. No exportPDF.
"""
from __future__ import annotations

import sys
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

_CONTRACT = "rf.document.dataset.v1"
_SCHEMA_VERSION = "1.0.0"

_VALID_DATASET = {
    "meta": {
        "doc_entry": 1,
        "doc_num": 1,
        "obj_type": "13",
        "currency": "USD",
    },
    "empresa": {
        "razon_social": "EMPRESA S.A.",
        "nombre_comercial": "EMPRESA",
        "ruc": "0991234567001",
        "direccion_matriz": "Av. Principal 1",
        "direccion_sucursal": "",
        "obligado_contabilidad": "SI",
        "agente_retencion": "NO",
    },
    "cliente": {
        "razon_social": "CLIENTE S.A.",
        "identificacion": "0923456789001",
        "direccion": "Calle 1",
        "email": "cliente@test.com",
    },
    "fiscal": {
        "ambiente": "2",
        "tipo_emision": "1",
        "numero_documento": "001-001-000000001",
        "numero_autorizacion": "12345678901234567890123456789012345678901234567890",
        "fecha_autorizacion": "2024-01-01T00:00:00",
        "clave_acceso": "12345678901234567890123456789012345678901234567890",
    },
    "pago": {
        "forma_pago_fe": "01",
        "total": 100.00,
    },
    "items": [
        {
            "codigo": "P001",
            "descripcion": "Producto 1",
            "cantidad": 1,
            "precio_unitario": 89.29,
            "descuento": 0,
            "subtotal": 89.29,
        }
    ],
    "totales": {
        "subtotal_12": 89.29,
        "subtotal_0": 0.0,
        "subtotal_sin_impuestos": 89.29,
        "iva_12": 10.71,
        "importe_total": 100.00,
    },
}


def _make_client():
    from fastapi.testclient import TestClient
    from reportforge.server.api import create_app
    return TestClient(create_app())


# ─────────────────────────────────────────────────────────────────────────────
# §1 — INVALID_DOC_TYPE
# ─────────────────────────────────────────────────────────────────────────────

class TestInvalidDocType(unittest.TestCase):

    def setUp(self):
        self.client = _make_client()

    def test_unknown_type_returns_400(self):
        r = self.client.get("/document/boleta/1")
        self.assertEqual(r.status_code, 400)

    def test_unknown_type_error_code(self):
        r = self.client.get("/document/boleta/1")
        self.assertEqual(r.json()["error"]["code"], "INVALID_DOC_TYPE")

    def test_unknown_type_envelope_has_contract(self):
        r = self.client.get("/document/boleta/1")
        body = r.json()
        self.assertEqual(body["contract"], _CONTRACT)
        self.assertEqual(body["schemaVersion"], _SCHEMA_VERSION)

    def test_empty_type_returns_400(self):
        r = self.client.get("/document//1")
        self.assertIn(r.status_code, (400, 404, 422))


# ─────────────────────────────────────────────────────────────────────────────
# §2 — INVALID_DOC_NUMBER
# ─────────────────────────────────────────────────────────────────────────────

class TestInvalidDocNumber(unittest.TestCase):

    def setUp(self):
        self.client = _make_client()

    def test_non_integer_returns_400(self):
        r = self.client.get("/document/factura/abc")
        self.assertEqual(r.status_code, 400)

    def test_non_integer_error_code(self):
        r = self.client.get("/document/factura/abc")
        self.assertEqual(r.json()["error"]["code"], "INVALID_DOC_NUMBER")

    def test_zero_returns_400(self):
        r = self.client.get("/document/factura/0")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["error"]["code"], "INVALID_DOC_NUMBER")

    def test_negative_returns_400(self):
        r = self.client.get("/document/factura/-5")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["error"]["code"], "INVALID_DOC_NUMBER")

    def test_invalid_number_envelope_has_contract(self):
        r = self.client.get("/document/factura/xyz")
        body = r.json()
        self.assertEqual(body["contract"], _CONTRACT)
        self.assertEqual(body["schemaVersion"], _SCHEMA_VERSION)


# ─────────────────────────────────────────────────────────────────────────────
# §3 — MAPPER_NOT_IMPLEMENTED (stubs raise NotImplementedError)
# ─────────────────────────────────────────────────────────────────────────────

class TestMapperNotImplemented(unittest.TestCase):

    def setUp(self):
        self.client = _make_client()

    def test_returns_501(self):
        # nota_credito is still a stub (factura now has a real implementation)
        r = self.client.get("/document/nota_credito/1")
        self.assertEqual(r.status_code, 501)

    def test_error_code_mapper_not_implemented(self):
        r = self.client.get("/document/nota_credito/1")
        self.assertEqual(r.json()["error"]["code"], "MAPPER_NOT_IMPLEMENTED")

    def test_envelope_has_contract(self):
        r = self.client.get("/document/nota_credito/1")
        body = r.json()
        self.assertEqual(body["contract"], _CONTRACT)
        self.assertEqual(body["schemaVersion"], _SCHEMA_VERSION)

    def test_unimplemented_doc_types_return_501(self):
        # remision has a working implementation; factura now has a real mapper
        for doc_type in ("nota_credito", "retencion", "liquidacion"):
            with self.subTest(doc_type=doc_type):
                r = self.client.get(f"/document/{doc_type}/1")
                self.assertEqual(r.status_code, 501, f"{doc_type} should be 501")


# ─────────────────────────────────────────────────────────────────────────────
# §4 — SCHEMA_MISMATCH
# ─────────────────────────────────────────────────────────────────────────────

class TestSchemaMismatch(unittest.TestCase):

    def setUp(self):
        self.client = _make_client()

    def _patch_builder(self, dataset: dict):
        from reportforge.core.render.doc_registry import DocType
        return patch.object(DocType, "call_builder", return_value=dataset)

    def test_missing_fields_returns_422(self):
        incomplete = deepcopy(_VALID_DATASET)
        del incomplete["fiscal"]
        with self._patch_builder(incomplete):
            r = self.client.get("/document/factura/1")
        self.assertEqual(r.status_code, 422)

    def test_missing_fields_error_code(self):
        incomplete = deepcopy(_VALID_DATASET)
        del incomplete["totales"]
        with self._patch_builder(incomplete):
            r = self.client.get("/document/factura/1")
        self.assertEqual(r.json()["error"]["code"], "SCHEMA_MISMATCH")

    def test_missing_fields_details_lists_paths(self):
        incomplete = deepcopy(_VALID_DATASET)
        del incomplete["pago"]
        with self._patch_builder(incomplete):
            r = self.client.get("/document/factura/1")
        self.assertIn("pago.", r.json()["error"]["details"])

    def test_schema_mismatch_envelope_has_contract(self):
        incomplete = deepcopy(_VALID_DATASET)
        del incomplete["meta"]
        with self._patch_builder(incomplete):
            r = self.client.get("/document/factura/1")
        body = r.json()
        self.assertEqual(body["contract"], _CONTRACT)
        self.assertEqual(body["schemaVersion"], _SCHEMA_VERSION)

    def test_items_not_list_returns_422(self):
        bad = deepcopy(_VALID_DATASET)
        bad["items"] = "not-a-list"
        with self._patch_builder(bad):
            r = self.client.get("/document/factura/1")
        self.assertEqual(r.status_code, 422)


# ─────────────────────────────────────────────────────────────────────────────
# §5 — Respuesta 200 OK con dataset válido
# ─────────────────────────────────────────────────────────────────────────────

class TestSuccessfulResponse(unittest.TestCase):
    """
    Patch fetch_document directly on the core module.
    The route handler imports fetch_document lazily (inside the function body),
    so patching the module attribute intercepts the call reliably across
    all test isolation strategies (threads, event loops, anyio portals).
    """

    _FETCH_TARGET = "reportforge.core.services.doc_query_core.fetch_document"

    def setUp(self):
        self.client = _make_client()

    @staticmethod
    def _make_envelope(doc_type="factura", doc_number=1, dataset=None):
        return {
            "contract": _CONTRACT,
            "schemaVersion": _SCHEMA_VERSION,
            "docType": doc_type,
            "docNumber": doc_number,
            "retrievedAt": "2024-01-01T00:00:00Z",
            "dataset": dataset if dataset is not None else _VALID_DATASET,
            "validation": {
                "schemaOk": True,
                "missingPaths": [],
                "extraPaths": [],
                "warnings": [],
            },
        }

    def _patch_fetch(self, envelope: dict):
        return patch(self._FETCH_TARGET, return_value=envelope)

    def test_200_with_valid_dataset(self):
        with self._patch_fetch(self._make_envelope()):
            r = self.client.get("/document/factura/1")
        self.assertEqual(r.status_code, 200)

    def test_response_has_contract_field(self):
        with self._patch_fetch(self._make_envelope()):
            r = self.client.get("/document/factura/1")
        self.assertEqual(r.json()["contract"], _CONTRACT)

    def test_response_has_schema_version(self):
        with self._patch_fetch(self._make_envelope()):
            r = self.client.get("/document/factura/1")
        self.assertEqual(r.json()["schemaVersion"], _SCHEMA_VERSION)

    def test_response_has_dataset(self):
        with self._patch_fetch(self._make_envelope()):
            r = self.client.get("/document/factura/1")
        self.assertIn("dataset", r.json())

    def test_response_has_validation_schema_ok(self):
        with self._patch_fetch(self._make_envelope()):
            r = self.client.get("/document/factura/1")
        body = r.json()
        self.assertIn("validation", body)
        self.assertTrue(body["validation"]["schemaOk"])

    def test_dataset_is_exactly_what_mapper_returned(self):
        envelope = self._make_envelope(dataset=_VALID_DATASET)
        with self._patch_fetch(envelope):
            r = self.client.get("/document/factura/1")
        self.assertEqual(r.json()["dataset"], _VALID_DATASET)

    def test_doc_type_and_number_echoed(self):
        envelope = self._make_envelope(doc_type="factura", doc_number=99)
        with self._patch_fetch(envelope):
            r = self.client.get("/document/factura/99")
        body = r.json()
        self.assertEqual(body["docType"], "factura")
        self.assertEqual(body["docNumber"], 99)


# ─────────────────────────────────────────────────────────────────────────────
# §6 — doc_shape_validator unit tests
# ─────────────────────────────────────────────────────────────────────────────

class TestDocShapeValidator(unittest.TestCase):

    def test_valid_dataset_schema_ok(self):
        from reportforge.core.services.doc_shape_validator import validate_dataset_shape
        result = validate_dataset_shape(_VALID_DATASET)
        self.assertTrue(result["schemaOk"])
        self.assertEqual(result["missingPaths"], [])

    def test_missing_section_detected(self):
        from reportforge.core.services.doc_shape_validator import validate_dataset_shape
        bad = deepcopy(_VALID_DATASET)
        del bad["totales"]
        result = validate_dataset_shape(bad)
        self.assertFalse(result["schemaOk"])
        self.assertTrue(any("totales." in p for p in result["missingPaths"]))

    def test_missing_field_within_section(self):
        from reportforge.core.services.doc_shape_validator import validate_dataset_shape
        bad = deepcopy(_VALID_DATASET)
        del bad["fiscal"]["clave_acceso"]
        result = validate_dataset_shape(bad)
        self.assertFalse(result["schemaOk"])
        self.assertIn("fiscal.clave_acceso", result["missingPaths"])

    def test_items_not_list_is_missing(self):
        from reportforge.core.services.doc_shape_validator import validate_dataset_shape
        bad = deepcopy(_VALID_DATASET)
        bad["items"] = {}
        result = validate_dataset_shape(bad)
        self.assertFalse(result["schemaOk"])
        self.assertIn("items", result["missingPaths"])

    def test_extra_section_reported(self):
        from reportforge.core.services.doc_shape_validator import validate_dataset_shape
        extra = deepcopy(_VALID_DATASET)
        extra["extra_section"] = {"foo": "bar"}
        result = validate_dataset_shape(extra)
        self.assertIn("extra_section", result["extraPaths"])

    def test_empty_required_field_generates_warning(self):
        from reportforge.core.services.doc_shape_validator import validate_dataset_shape
        warn = deepcopy(_VALID_DATASET)
        warn["fiscal"]["clave_acceso"] = ""
        result = validate_dataset_shape(warn)
        self.assertTrue(result["schemaOk"])
        self.assertTrue(any("fiscal.clave_acceso" in w for w in result["warnings"]))


# ─────────────────────────────────────────────────────────────────────────────
# §7 — Error envelope invariants
# ─────────────────────────────────────────────────────────────────────────────

class TestErrorEnvelopeInvariants(unittest.TestCase):
    """Every error response must carry contract and schemaVersion."""

    def setUp(self):
        self.client = _make_client()

    def _assert_contract_fields(self, body: dict):
        self.assertEqual(body.get("contract"), _CONTRACT)
        self.assertEqual(body.get("schemaVersion"), _SCHEMA_VERSION)
        self.assertIn("error", body)
        self.assertIn("code", body["error"])
        self.assertIn("message", body["error"])
        self.assertIn("details", body["error"])

    def test_invalid_type_error_envelope(self):
        r = self.client.get("/document/unknown/1")
        self._assert_contract_fields(r.json())

    def test_invalid_number_error_envelope(self):
        r = self.client.get("/document/factura/abc")
        self._assert_contract_fields(r.json())

    def test_mapper_not_implemented_error_envelope(self):
        r = self.client.get("/document/nota_credito/1")
        self._assert_contract_fields(r.json())


if __name__ == "__main__":
    unittest.main()
