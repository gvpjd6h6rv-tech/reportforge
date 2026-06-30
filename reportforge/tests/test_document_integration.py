"""
test_document_integration.py

Integration smoke para GET /document/{type}/{number}.
Ejercita la cadena real: router → core → mapper → query helpers → DB.

Grupos:
  A — live_db: requieren SAP_B1_DB_URL + SAP_B1_TEST_DOC_ENTRY (se omiten si no están).
  B — smoke:   errores reales sin BD activa.

Variables de entorno:
  SAP_B1_DB_URL          — connection string MSSQL para Grupo A
  SAP_B1_TEST_DOC_ENTRY  — DocEntry de una factura existente para Grupo A

Ejecución solo Grupo B (sin BD):
  pytest reportforge/tests/test_document_integration.py -m "not live_db" -v

Ejecución completa (requiere BD):
  SAP_B1_DB_URL="mssql+pyodbc://..." SAP_B1_TEST_DOC_ENTRY=12345 \\
    pytest reportforge/tests/test_document_integration.py -v
"""
from __future__ import annotations

import contextlib
import importlib
import os
import sys
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

_CONTRACT = "rf.document.dataset.v1"
_SCHEMA_VERSION_MAJOR = 1

_DB_URL = os.environ.get("SAP_B1_DB_URL", "")
_TEST_DOC_ENTRY = os.environ.get("SAP_B1_TEST_DOC_ENTRY", "")
_LIVE_DB = bool(_DB_URL and _TEST_DOC_ENTRY)

_SA_QUERY_TARGET = "reportforge.core.models.invoice_queries.pymssql_query"

# Dummy URL used when we only need the datasource registered but mock pymssql_query.
_DUMMY_URL = "mssql+pyodbc://test:x@localhost:1433/TEST"

# URL that guarantees a real connection failure (port 9 is discard/reserved).
_BAD_URL = "mssql+pyodbc://nobody:x@127.0.0.1:9/NoDb"

live_db = pytest.mark.skipif(
    not _LIVE_DB,
    reason="SAP_B1_DB_URL y SAP_B1_TEST_DOC_ENTRY requeridos para tests live"
)


@contextlib.contextmanager
def _register_datasource(url: str):
    """Register URL in the shared _REGISTRY, clean up after."""
    from reportforge.core.render.datasource.db_source_registry import register, unregister
    register("sap_b1", {"url": url, "type": "db"})
    try:
        yield
    finally:
        unregister("sap_b1")


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from reportforge.server.api import create_app
    return TestClient(create_app())


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de validación de envelope
# ─────────────────────────────────────────────────────────────────────────────

def _assert_contract_envelope(body: dict) -> None:
    assert body.get("contract") == _CONTRACT, f"contract: {body.get('contract')}"
    major = int(body.get("schemaVersion", "0.0.0").split(".")[0])
    assert major == _SCHEMA_VERSION_MAJOR, f"schemaVersion major: {major}"


def _assert_error_envelope(body: dict, expected_code: str) -> None:
    _assert_contract_envelope(body)
    assert "error" in body, f"sin error envelope: {body}"
    assert body["error"]["code"] == expected_code, \
        f"code esperado={expected_code}, got={body['error']['code']}"
    assert "message" in body["error"]
    assert "details" in body["error"]


# ─────────────────────────────────────────────────────────────────────────────
# Grupo A — Live DB (se omiten sin SAP_B1_DB_URL + SAP_B1_TEST_DOC_ENTRY)
# ─────────────────────────────────────────────────────────────────────────────

@live_db
def test_live_factura_existente_200(client):
    """GET /document/factura/{entry} existente → 200 con dataset válido."""
    r = client.get(f"/document/factura/{_TEST_DOC_ENTRY}")
    assert r.status_code == 200, r.text
    body = r.json()
    _assert_contract_envelope(body)
    assert body["validation"]["schemaOk"] is True, body["validation"]
    ds = body["dataset"]
    assert "meta" in ds and ds["meta"]["doc_entry"] == int(_TEST_DOC_ENTRY)
    assert isinstance(ds.get("items"), list)
    assert len(ds["items"]) > 0, "items no puede estar vacío para una factura real"


@live_db
def test_live_factura_inexistente_404(client):
    """DocEntry 999999999 no existe en SAP B1 → 404 DOC_NOT_FOUND."""
    r = client.get("/document/factura/999999999")
    assert r.status_code == 404, r.text
    _assert_error_envelope(r.json(), "DOC_NOT_FOUND")


# ─────────────────────────────────────────────────────────────────────────────
# Grupo B — Error path smoke (sin BD activa)
# ─────────────────────────────────────────────────────────────────────────────

def test_db_connection_failed_503(client):
    """
    Datasource inválido → DB_CONNECTION_FAILED → 503.

    La cadena real: _resolve_db_spec() → pymssql_query(spec, ...) falla
    (sin SA: RuntimeError; con SA: OperationalError) →
    _reclassify() → DbConnectionError → DocumentQueryError(503).
    """
    with _register_datasource(_BAD_URL):
        r = client.get("/document/factura/1")
    assert r.status_code == 503, r.text
    _assert_error_envelope(r.json(), "DB_CONNECTION_FAILED")


def test_db_timeout_504(client):
    """
    Timeout en query → DB_TIMEOUT → 504.

    Inyección en la frontera pymssql_query: DbTimeoutError ya tipado →
    _reclassify lo reconoce y re-raises →
    fetch_invoice_header → fetch_document → DocumentQueryError(504).
    """
    from reportforge.core.render.datasource.db_source_errors import DbTimeoutError

    with _register_datasource(_DUMMY_URL):
        with patch(_SA_QUERY_TARGET, side_effect=DbTimeoutError("query timeout exceeded")):
            r = client.get("/document/factura/1")

    assert r.status_code == 504, r.text
    _assert_error_envelope(r.json(), "DB_TIMEOUT")


def test_schema_mismatch_422(client):
    """
    Mapper retorna dataset incompleto → SCHEMA_MISMATCH → 422.

    Se parchea build_invoice_model en el módulo cargado por call_builder
    (importlib key 'core.models.invoice_model'). El core llama al validator
    real → detecta paths faltantes → DocumentQueryError(422).
    """
    incomplete = {
        "meta": {"doc_entry": 1, "doc_num": 1},
        # faltan: empresa, cliente, fiscal, pago, items, totales
    }
    mod = importlib.import_module("core.models.invoice_model")
    with patch.object(mod, "build_invoice_model", return_value=incomplete):
        r = client.get("/document/factura/1")

    assert r.status_code == 422, r.text
    body = r.json()
    _assert_error_envelope(body, "SCHEMA_MISMATCH")
    assert "Paths faltantes" in body["error"]["details"]


def test_factura_inexistente_404_smoke(client):
    """
    OINV devuelve 0 filas → DbDocNotFoundError → DOC_NOT_FOUND → 404.

    Simula exactamente la ruta del mapper cuando DocEntry no existe.
    """
    with _register_datasource(_DUMMY_URL):
        with patch(_SA_QUERY_TARGET, return_value=[]):
            r = client.get("/document/factura/999")

    assert r.status_code == 404, r.text
    _assert_error_envelope(r.json(), "DOC_NOT_FOUND")


# ─────────────────────────────────────────────────────────────────────────────
# Invariantes del envelope en todos los paths de error
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("path,expected_code,expected_status", [
    ("/document/invalid_type/1",    "INVALID_DOC_TYPE",   400),
    ("/document/factura/abc",       "INVALID_DOC_NUMBER", 400),
    ("/document/factura/0",         "INVALID_DOC_NUMBER", 400),
    ("/document/nota_credito/1",    "MAPPER_NOT_IMPLEMENTED", 501),
])
def test_error_envelope_invariants(client, path, expected_code, expected_status):
    """Todos los errores llevan contract + schemaVersion + error.{code,message,details}."""
    r = client.get(path)
    assert r.status_code == expected_status, r.text
    _assert_error_envelope(r.json(), expected_code)
