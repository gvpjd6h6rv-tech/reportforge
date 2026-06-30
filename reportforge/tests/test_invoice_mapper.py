"""
test_invoice_mapper.py

Tests para build_invoice_model y los query helpers de invoice_queries.
No conexión real a SAP B1. Todas las llamadas a sa_query son mockeadas.
No PreviewEngine. No exportPDF.
"""
from __future__ import annotations

import contextlib
import sys
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import MagicMock, patch

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

_SA_QUERY_TARGET = "reportforge.core.models.invoice_queries.pymssql_query"
_GET_REGISTERED_TARGET = "reportforge.core.models.invoice_model.get_registered"

_HEADER_ROW = {
    "doc_entry": 1001,
    "doc_num": 42,
    "obj_type": "13",
    "currency": "USD",
    "cliente_nombre": "CLIENTE TEST S.A.",
    "cliente_ruc": "0991234567001",
    "cliente_email": "cliente@test.com",
    "cliente_direccion": "Av. Siempre Viva 742",
    "cliente_tipo_id": "04",
    "total": 112.00,
    "iva": 12.00,
    "ambiente": "2",
    "tipo_comprobante": "01",
    "tipo_emision": "1",
    "estado_fe": "A",
    # numero_documento is NOT a DB column; derived from ser_est+ser_pe+folio_num
    "ser_est": "001",
    "ser_pe": "001",
    "folio_num": 42,
    "clave_acceso": "0102202001991234567001010010010000000421234567811",
    "numero_autorizacion": "0102202001991234567001010010010000000421234567811",
    "fecha_autorizacion": "2024-01-02T10:00:00",
    "forma_pago_fe": "01",
}

_LINE_ROW = {
    "codigo": "PROD-001",
    "descripcion": "Producto de prueba",
    "cantidad": 2.0,
    "precio_unitario": 50.00,
    "descuento": 0.0,
    "desc_lineal": 0.0,
    "subtotal": 100.00,
    "tax_code": "IVA12",
    "ice_porcentaje": 0.0,
    "ice_valor": 0.0,
}

_COMPANY_ROW = {
    "razon_social": "EMPRESA DEMO S.A.",
    "ruc": "0991111111001",
    "direccion_matriz": "Av. Principal 100, Guayaquil",
}

_SPEC = {
    "type": "mssql",
    "host": "host",
    "port": 1433,
    "database": "SBO_DEMO",
    "username": "user",
    "password": "pass",
}


def _patch_sa(header=None, lines=None, company=None):
    """Return pymssql_query mock with pre-programmed side_effects per call order."""
    header_rows = [header if header is not None else _HEADER_ROW]
    line_rows = lines if lines is not None else [_LINE_ROW]
    company_rows = [company if company is not None else _COMPANY_ROW]
    mock = MagicMock(side_effect=[header_rows, line_rows, company_rows])
    return patch(_SA_QUERY_TARGET, mock)


def _patch_registered():
    return patch(_GET_REGISTERED_TARGET, return_value=_SPEC)


# For §5 endpoint tests, call_builder loads 'reportforge.core.models.invoice_model'
# via importlib — same sys.modules key as the module patched by _SA_QUERY_TARGET.
# We manipulate the shared _REGISTRY dict directly so get_registered() returns
# the test spec regardless of call site.
@contextlib.contextmanager
def _register_datasource():
    from reportforge.core.render.datasource.db_source_registry import register, unregister
    register("sap_b1", _SPEC)
    try:
        yield
    finally:
        unregister("sap_b1")


# ─────────────────────────────────────────────────────────────────────────────
# §1 — Dataset válido a partir de rows mockeadas
# ─────────────────────────────────────────────────────────────────────────────

class TestValidInvoiceReturnsDataset(unittest.TestCase):

    def _call(self):
        from reportforge.core.models.invoice_model import build_invoice_model
        with _patch_registered(), _patch_sa():
            return build_invoice_model(1001)

    def test_returns_dict(self):
        result = self._call()
        self.assertIsInstance(result, dict)

    def test_meta_fields(self):
        result = self._call()
        meta = result["meta"]
        self.assertEqual(meta["doc_entry"], 1001)
        self.assertEqual(meta["doc_num"], 42)
        self.assertEqual(meta["currency"], "USD")
        self.assertEqual(meta["obj_type"], "13")

    def test_empresa_fields(self):
        result = self._call()
        emp = result["empresa"]
        self.assertEqual(emp["razon_social"], "EMPRESA DEMO S.A.")
        self.assertEqual(emp["ruc"], "0991111111001")
        self.assertIn("direccion_matriz", emp)
        self.assertEqual(emp["obligado_contabilidad"], "SI")
        self.assertEqual(emp["agente_retencion"], "NO")

    def test_cliente_fields(self):
        result = self._call()
        cli = result["cliente"]
        self.assertEqual(cli["razon_social"], "CLIENTE TEST S.A.")
        self.assertEqual(cli["identificacion"], "0991234567001")
        self.assertEqual(cli["email"], "cliente@test.com")

    def test_fiscal_fields(self):
        result = self._call()
        fis = result["fiscal"]
        self.assertEqual(fis["numero_documento"], "001-001-000000042")
        self.assertEqual(fis["ambiente_raw"], "2")
        self.assertEqual(fis["ambiente"], "Producción")
        self.assertEqual(fis["tipo_emision"], "1")
        self.assertIn("clave_acceso", fis)

    def test_fiscal_ambiente_mapping(self):
        from reportforge.core.models.invoice_model import build_invoice_model

        for raw, label in [("1", "Pruebas"), ("2", "Producción")]:
            header = {**_HEADER_ROW, "ambiente": raw}
            mock_sa = MagicMock(side_effect=[[header], [_LINE_ROW], [_COMPANY_ROW]])
            with _patch_registered(), patch(_SA_QUERY_TARGET, mock_sa):
                result = build_invoice_model(1001)
            fis = result["fiscal"]
            self.assertEqual(fis["ambiente_raw"], raw)
            self.assertEqual(fis["ambiente"], label)

    def test_fiscal_ambiente_unknown_value_passes_through(self):
        from reportforge.core.models.invoice_model import build_invoice_model

        header = {**_HEADER_ROW, "ambiente": "9"}
        mock_sa = MagicMock(side_effect=[[header], [_LINE_ROW], [_COMPANY_ROW]])
        with _patch_registered(), patch(_SA_QUERY_TARGET, mock_sa):
            result = build_invoice_model(1001)
        fis = result["fiscal"]
        self.assertEqual(fis["ambiente_raw"], "9")
        self.assertEqual(fis["ambiente"], "9")

    def test_items_list(self):
        result = self._call()
        self.assertIsInstance(result["items"], list)
        self.assertEqual(len(result["items"]), 1)
        item = result["items"][0]
        self.assertEqual(item["codigo"], "PROD-001")
        self.assertEqual(item["cantidad"], 2.0)
        self.assertEqual(item["subtotal"], 100.0)

    def test_totales_fields(self):
        result = self._call()
        tot = result["totales"]
        self.assertAlmostEqual(tot["iva_12"], 12.00)
        self.assertAlmostEqual(tot["importe_total"], 112.00)
        self.assertAlmostEqual(tot["subtotal_sin_impuestos"], 100.00)
        self.assertAlmostEqual(tot["subtotal_12"], 100.00)
        self.assertAlmostEqual(tot["subtotal_0"], 0.0)

    def test_pago_fields(self):
        result = self._call()
        self.assertEqual(result["pago"]["forma_pago_fe"], "01")
        self.assertAlmostEqual(result["pago"]["total"], 112.00)


# ─────────────────────────────────────────────────────────────────────────────
# §2 — DOC_NOT_FOUND cuando OINV devuelve 0 filas
# ─────────────────────────────────────────────────────────────────────────────

class TestDocNotFound(unittest.TestCase):

    def test_empty_header_raises_doc_not_found(self):
        from reportforge.core.models.invoice_model import build_invoice_model
        from reportforge.core.render.datasource.db_source_errors import DbDocNotFoundError

        empty_sa = MagicMock(return_value=[])
        with _patch_registered(), patch(_SA_QUERY_TARGET, empty_sa):
            with self.assertRaises(DbDocNotFoundError):
                build_invoice_model(9999)

    def test_not_found_message_includes_doc_entry(self):
        from reportforge.core.models.invoice_model import build_invoice_model
        from reportforge.core.render.datasource.db_source_errors import DbDocNotFoundError

        empty_sa = MagicMock(return_value=[])
        with _patch_registered(), patch(_SA_QUERY_TARGET, empty_sa):
            with self.assertRaises(DbDocNotFoundError) as ctx:
                build_invoice_model(9999)
        self.assertIn("9999", str(ctx.exception))

    def test_no_datasource_raises_db_connection_error(self):
        from reportforge.core.models.invoice_model import build_invoice_model
        from reportforge.core.render.datasource.db_source_errors import DbConnectionError

        with patch(_GET_REGISTERED_TARGET, return_value=None):
            with self.assertRaises(DbConnectionError):
                build_invoice_model(1)


# ─────────────────────────────────────────────────────────────────────────────
# §3 — Los queries usan parámetros preparados, no concatenación de strings
# ─────────────────────────────────────────────────────────────────────────────

class TestPreparedParams(unittest.TestCase):

    def test_header_query_passes_doc_entry_as_param(self):
        from reportforge.core.models.invoice_model import build_invoice_model

        mock_sa = MagicMock(side_effect=[[_HEADER_ROW], [_LINE_ROW], [_COMPANY_ROW]])
        with _patch_registered(), patch(_SA_QUERY_TARGET, mock_sa):
            build_invoice_model(1001)

        header_call = mock_sa.call_args_list[0]
        _spec, _query, params = header_call[0]
        self.assertIsInstance(params, dict)
        self.assertIn("doc_entry", params)
        self.assertEqual(params["doc_entry"], 1001)

    def test_doc_entry_not_concatenated_into_sql(self):
        from reportforge.core.models.invoice_model import build_invoice_model

        mock_sa = MagicMock(side_effect=[[_HEADER_ROW], [_LINE_ROW], [_COMPANY_ROW]])
        with _patch_registered(), patch(_SA_QUERY_TARGET, mock_sa):
            build_invoice_model(1001)

        for c in mock_sa.call_args_list:
            _spec, query, _params = c[0]
            self.assertNotIn("1001", query, "doc_entry must not be concatenated into SQL")

    def test_lines_query_passes_doc_entry_as_param(self):
        from reportforge.core.models.invoice_model import build_invoice_model

        mock_sa = MagicMock(side_effect=[[_HEADER_ROW], [_LINE_ROW], [_COMPANY_ROW]])
        with _patch_registered(), patch(_SA_QUERY_TARGET, mock_sa):
            build_invoice_model(42)

        lines_call = mock_sa.call_args_list[1]
        _spec, _query, params = lines_call[0]
        self.assertEqual(params["doc_entry"], 42)


# ─────────────────────────────────────────────────────────────────────────────
# §4 — El mapper no muta los datos de origen
# ─────────────────────────────────────────────────────────────────────────────

class TestMapperNoMutation(unittest.TestCase):

    def test_returned_dataset_is_independent_per_call(self):
        from reportforge.core.models.invoice_model import build_invoice_model

        def make_sa():
            return MagicMock(side_effect=[
                [deepcopy(_HEADER_ROW)], [deepcopy(_LINE_ROW)], [deepcopy(_COMPANY_ROW)]
            ])

        with _patch_registered():
            with patch(_SA_QUERY_TARGET, make_sa()):
                result1 = build_invoice_model(1001)
            with patch(_SA_QUERY_TARGET, make_sa()):
                result2 = build_invoice_model(1001)

        result1["meta"]["doc_entry"] = 9999
        self.assertNotEqual(result2["meta"]["doc_entry"], 9999)

    def test_items_list_is_fresh_each_call(self):
        from reportforge.core.models.invoice_model import build_invoice_model

        def make_sa():
            return MagicMock(side_effect=[
                [deepcopy(_HEADER_ROW)], [deepcopy(_LINE_ROW)], [deepcopy(_COMPANY_ROW)]
            ])

        with _patch_registered():
            with patch(_SA_QUERY_TARGET, make_sa()):
                result1 = build_invoice_model(1001)
            with patch(_SA_QUERY_TARGET, make_sa()):
                result2 = build_invoice_model(1001)

        result1["items"].append({"extra": True})
        self.assertEqual(len(result2["items"]), 1)


# ─────────────────────────────────────────────────────────────────────────────
# §5 — Endpoint retorna 200 con mapper real (mocked DB)
# ─────────────────────────────────────────────────────────────────────────────

class TestEndpoint200WithRealMapper(unittest.TestCase):
    """
    Exercises the full stack: route → fetch_document → call_builder →
    build_invoice_model → fetch_* → sa_query (mocked).

    call_builder loads invoice_model as 'core.models.invoice_model' via
    importlib, which is a different sys.modules key than
    'reportforge.core.models.invoice_model'. To ensure get_registered()
    returns the test URL in both module copies, we register directly in the
    shared _REGISTRY (not via patch on a specific module attribute).
    """

    def _make_client(self):
        from fastapi.testclient import TestClient
        from reportforge.server.api import create_app
        return TestClient(create_app())

    def test_endpoint_200_when_mapper_returns_valid_dataset(self):
        client = self._make_client()
        mock_sa = MagicMock(side_effect=[[_HEADER_ROW], [_LINE_ROW], [_COMPANY_ROW]])
        with _register_datasource():
            with patch(_SA_QUERY_TARGET, mock_sa):
                r = client.get("/document/factura/1001")
        self.assertEqual(r.status_code, 200)

    def test_endpoint_response_contract(self):
        client = self._make_client()
        mock_sa = MagicMock(side_effect=[[_HEADER_ROW], [_LINE_ROW], [_COMPANY_ROW]])
        with _register_datasource():
            with patch(_SA_QUERY_TARGET, mock_sa):
                r = client.get("/document/factura/1001")
        body = r.json()
        self.assertEqual(body["contract"], "rf.document.dataset.v1")
        self.assertTrue(body["validation"]["schemaOk"])

    def test_endpoint_404_when_doc_not_found(self):
        client = self._make_client()
        empty_sa = MagicMock(return_value=[])
        with _register_datasource():
            with patch(_SA_QUERY_TARGET, empty_sa):
                r = client.get("/document/factura/9999")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json()["error"]["code"], "DOC_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
