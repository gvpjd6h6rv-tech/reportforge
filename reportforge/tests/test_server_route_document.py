"""
test_server_route_document.py

Verifies that reportforge_server.py (stdlib server) exposes
GET /document/{type}/{number} with contract-compliant responses.

§1  handle_get routes /document/{type}/{number} to _get_document
§2  INVALID_DOC_TYPE — returns contract envelope, not bare "Not found"
§3  INVALID_DOC_NUMBER — returns contract envelope
§4  DOC_NOT_FOUND / DB_CONNECTION_FAILED — contract envelope from DocumentQueryError
§5  /datasources still routes (regression)
§6  Contract envelope fields: contract, schemaVersion, error.code
"""
from __future__ import annotations

import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))


def _make_handler(path: str):
    h = MagicMock()
    h.path = path
    h.headers = {"Content-Length": "0"}
    h.rfile = MagicMock()
    h.rfile.read = MagicMock(return_value=b"{}")
    h.wfile = io.BytesIO()
    h.send_response = MagicMock()
    h.send_header = MagicMock()
    h.end_headers = MagicMock()
    return h


def _capture_json(handler):
    """Reconstruct the JSON body written to handler.wfile."""
    handler.wfile.seek(0)
    return json.loads(handler.wfile.read().decode())


# ── §1 — Routing ──────────────────────────────────────────────────────────────

class TestRouting(unittest.TestCase):

    def test_handle_get_routes_document_path(self):
        from reportforge_server_services import handle_get
        h = _make_handler("/document/factura/50000")
        with patch("reportforge_server_route_document._get_document") as mock_fn:
            handle_get(h)
        mock_fn.assert_called_once_with(h, "factura", "50000")

    def test_handle_get_routes_nota_credito(self):
        from reportforge_server_services import handle_get
        h = _make_handler("/document/nota_credito/99")
        with patch("reportforge_server_route_document._get_document") as mock_fn:
            handle_get(h)
        mock_fn.assert_called_once_with(h, "nota_credito", "99")

    def test_handle_get_does_not_route_two_segment_document(self):
        """Path /document/factura (no number) must NOT match the document route."""
        from reportforge_server_services import handle_get
        h = _make_handler("/document/factura")
        with patch("reportforge_server_route_document._get_document") as mock_fn:
            with patch("reportforge_server_http_utils._not_found"):
                handle_get(h)
        mock_fn.assert_not_called()


# ── §2 — INVALID_DOC_TYPE ────────────────────────────────────────────────────

class TestInvalidDocType(unittest.TestCase):

    def _call(self, doc_type="boleta", doc_number="1"):
        from reportforge_server_route_document import _get_document
        h = _make_handler(f"/document/{doc_type}/{doc_number}")
        responses = []
        with patch("reportforge_server_route_document._respond",
                   side_effect=lambda hh, status, body, ct: responses.append((status, json.loads(body)))):
            _get_document(h, doc_type, doc_number)
        return responses

    def test_invalid_type_returns_400(self):
        responses = self._call("boleta", "1")
        self.assertEqual(responses[0][0], 400)

    def test_invalid_type_has_contract(self):
        responses = self._call("boleta", "1")
        body = responses[0][1]
        self.assertEqual(body["contract"], "rf.document.dataset.v1")
        self.assertEqual(body["schemaVersion"], "1.0.0")

    def test_invalid_type_error_code(self):
        responses = self._call("boleta", "1")
        self.assertEqual(responses[0][1]["error"]["code"], "INVALID_DOC_TYPE")

    def test_invalid_type_not_bare_not_found(self):
        """Must not return the bare {'error': 'Not found: ...'} that _not_found produces."""
        responses = self._call("boleta", "1")
        body = responses[0][1]
        self.assertIn("contract", body, "Response must have 'contract' field (contract envelope)")


# ── §3 — INVALID_DOC_NUMBER ───────────────────────────────────────────────────

class TestInvalidDocNumber(unittest.TestCase):

    def _call(self, doc_number):
        from reportforge_server_route_document import _get_document
        h = _make_handler(f"/document/factura/{doc_number}")
        responses = []
        with patch("reportforge_server_route_document._respond",
                   side_effect=lambda hh, status, body, ct: responses.append((status, json.loads(body)))):
            _get_document(h, "factura", doc_number)
        return responses

    def test_non_integer_returns_400(self):
        self.assertEqual(self._call("abc")[0][0], 400)

    def test_zero_returns_400(self):
        self.assertEqual(self._call("0")[0][0], 400)

    def test_negative_returns_400(self):
        self.assertEqual(self._call("-5")[0][0], 400)

    def test_error_code_invalid_doc_number(self):
        body = self._call("abc")[0][1]
        self.assertEqual(body["error"]["code"], "INVALID_DOC_NUMBER")

    def test_has_contract_envelope(self):
        body = self._call("abc")[0][1]
        self.assertIn("contract", body)
        self.assertIn("schemaVersion", body)


# ── §4 — DocumentQueryError propagation ──────────────────────────────────────

class TestDocumentQueryErrorPropagation(unittest.TestCase):

    def _call_with_error(self, error_code, http_status):
        from reportforge_server_route_document import _get_document
        from reportforge.core.services.doc_query_core import DocumentQueryError
        h = _make_handler("/document/factura/50000")
        exc = DocumentQueryError(error_code, "Mensaje de error", "detalles", http_status)
        responses = []
        with patch("reportforge_server_route_document._respond",
                   side_effect=lambda hh, status, body, ct: responses.append((status, json.loads(body)))):
            with patch("reportforge.core.services.doc_query_core.fetch_document", side_effect=exc):
                _get_document(h, "factura", "50000")
        return responses

    def test_doc_not_found_returns_404(self):
        responses = self._call_with_error("DOC_NOT_FOUND", 404)
        self.assertEqual(responses[0][0], 404)

    def test_doc_not_found_has_contract_envelope(self):
        body = self._call_with_error("DOC_NOT_FOUND", 404)[0][1]
        self.assertEqual(body["contract"], "rf.document.dataset.v1")
        self.assertEqual(body["error"]["code"], "DOC_NOT_FOUND")

    def test_db_connection_failed_returns_503(self):
        responses = self._call_with_error("DB_CONNECTION_FAILED", 503)
        self.assertEqual(responses[0][0], 503)

    def test_db_connection_failed_has_contract_envelope(self):
        body = self._call_with_error("DB_CONNECTION_FAILED", 503)[0][1]
        self.assertEqual(body["error"]["code"], "DB_CONNECTION_FAILED")

    def test_mapper_not_implemented_returns_501(self):
        responses = self._call_with_error("MAPPER_NOT_IMPLEMENTED", 501)
        self.assertEqual(responses[0][0], 501)


# ── §5 — /datasources regression ─────────────────────────────────────────────

class TestDatasourcesRegression(unittest.TestCase):

    def test_datasources_still_routes(self):
        from reportforge_server_services import handle_get
        h = _make_handler("/datasources")
        with patch("reportforge_server_services._get_ds_list") as mock_fn:
            handle_get(h)
        mock_fn.assert_called_once_with(h)


# ── §6 — Query param parsing ──────────────────────────────────────────────────

class TestQueryParams(unittest.TestCase):

    def test_datasource_param_passed_to_fetch(self):
        from reportforge_server_route_document import _get_document
        h = _make_handler("/document/factura/42?datasource=sap_b1&timeout=15")
        called_with = {}
        from reportforge.core.services.doc_query_core import DocumentQueryError
        def fake_fetch(doc_type, doc_num_int, datasource_alias, timeout):
            called_with.update({"datasource_alias": datasource_alias, "timeout": timeout})
            raise DocumentQueryError("DOC_NOT_FOUND", "x", "y", 404)
        with patch("reportforge_server_route_document._respond"):
            with patch("reportforge.core.services.doc_query_core.fetch_document", side_effect=fake_fetch):
                _get_document(h, "factura", "42")
        self.assertEqual(called_with.get("datasource_alias"), "sap_b1")
        self.assertEqual(called_with.get("timeout"), 15)

    def test_timeout_clamped_to_60(self):
        from reportforge_server_route_document import _get_document
        h = _make_handler("/document/factura/42?timeout=999")
        called_with = {}
        from reportforge.core.services.doc_query_core import DocumentQueryError
        def fake_fetch(doc_type, doc_num_int, datasource_alias, timeout):
            called_with["timeout"] = timeout
            raise DocumentQueryError("DOC_NOT_FOUND", "x", "y", 404)
        with patch("reportforge_server_route_document._respond"):
            with patch("reportforge.core.services.doc_query_core.fetch_document", side_effect=fake_fetch):
                _get_document(h, "factura", "42")
        self.assertEqual(called_with.get("timeout"), 60)


if __name__ == "__main__":
    unittest.main()
