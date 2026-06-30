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


def test_db_query_failed_500(client):
    """
    SQL schema error (e.g. Invalid column name) → DB_QUERY_FAILED → 500.
    Not classified as DB_CONNECTION_FAILED — the connection was fine.
    """
    class FakeProgrammingError(Exception):
        pass
    FakeProgrammingError.__name__ = "ProgrammingError"

    with _register_datasource(_DUMMY_URL):
        with patch(_SA_QUERY_TARGET, side_effect=FakeProgrammingError("Invalid column name 'DocCurrency'")):
            r = client.get("/document/factura/1")

    assert r.status_code == 500, r.text
    _assert_error_envelope(r.json(), "DB_QUERY_FAILED")


def test_no_doc_currency_in_header_sql():
    """Regression: OINV.DocCurrency does not exist; must use DocCur."""
    import inspect
    from reportforge.core.models import invoice_queries
    src = inspect.getsource(invoice_queries)
    assert "DocCurrency" not in src, (
        "DocCurrency is not a valid SAP B1 column — use DocCur"
    )
    assert "DocCur" in src, "header SQL must select DocCur from OINV"


def test_no_u_ambiente_in_header_sql():
    """Regression: U_Ambiente renamed to U_EXX_FE_TIPAMB in this SAP installation."""
    import inspect
    from reportforge.core.models import invoice_queries
    src = inspect.getsource(invoice_queries)
    assert "U_Ambiente" not in src, (
        "U_Ambiente is not valid here — use U_EXX_FE_TIPAMB"
    )
    assert "U_EXX_FE_TIPAMB" in src


def test_header_sql_udf_column_names():
    """Regression: all six UDF column names in _HEADER_SQL must be the real SAP B1 Ecuador names."""
    import inspect
    from reportforge.core.models import invoice_queries
    src = inspect.getsource(invoice_queries)

    wrong = {
        "U_TipoEmision":       "use U_EXX_FE_TIPEMI",
        "U_NumDocumento":      "derived from U_SER_EST+U_SER_PE+FolioNum",
        "U_ClaveAcceso":       "use U_NUM_AUTOR",
        "U_NumAutorizacion":   "use U_NUM_AUTOR",
        "U_FechaAutorizacion": "use U_EXX_FE_FECAUT",
        "U_FormaPagoFE":       "join [@EXX_FPAGO_VENT_DET] via U_EXX_FPAGO_VENTAS",
    }
    for col, hint in wrong.items():
        assert col not in src, f"{col} is not a valid SAP B1 column — {hint}"

    correct = ["U_EXX_FE_TIPEMI", "U_SER_EST", "U_SER_PE", "FolioNum",
               "U_NUM_AUTOR", "U_EXX_FE_FECAUT", "EXX_FPAGO_VENT_DET"]
    for col in correct:
        assert col in src, f"Expected column/table {col} missing from header SQL"


def test_numero_documento_derived_from_ser_est_ser_pe_folio(client):
    """numero_documento in fiscal is constructed as ser_est-ser_pe-folio_num(zfill9)."""
    mock_sa = MagicMock(side_effect=[[_HEADER_ROW], [_LINE_ROW], [_COMPANY_ROW]])
    with _register_alias("sap_b1_linux", _LINUX_SPEC):
        with patch(_SA_QUERY_TARGET, mock_sa):
            r = client.get("/document/factura/1001?datasource=sap_b1_linux")
    assert r.status_code == 200, r.text
    fiscal = r.json()["dataset"]["fiscal"]
    assert fiscal["numero_documento"] == "001-001-000000042"


def test_schema_mismatch_422(client):
    """
    Mapper retorna dataset incompleto → SCHEMA_MISMATCH → 422.

    Se parchea build_invoice_model en el módulo cargado por call_builder
    (importlib key 'reportforge.core.models.invoice_model'). El core llama al
    validator real → detecta paths faltantes → DocumentQueryError(422).
    """
    incomplete = {
        "meta": {"doc_entry": 1, "doc_num": 1},
        # faltan: empresa, cliente, fiscal, pago, items, totales
    }
    mod = importlib.import_module("reportforge.core.models.invoice_model")
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
# Grupo C — builder_module import resolution
# ─────────────────────────────────────────────────────────────────────────────

def test_call_builder_module_is_importable():
    """
    REGISTRY['factura'].builder_module must resolve via importlib without
    raising ModuleNotFoundError.  Catches the 'No module named core' regression
    where builder_module used a bare 'core.*' path instead of
    'reportforge.core.*'.
    """
    import importlib
    from reportforge.core.render.doc_registry import REGISTRY

    for key, doc_type in REGISTRY.items():
        try:
            mod = importlib.import_module(doc_type.builder_module)
        except ModuleNotFoundError as exc:
            pytest.fail(
                f"REGISTRY['{key}'].builder_module='{doc_type.builder_module}' "
                f"cannot be imported: {exc}"
            )
        assert hasattr(mod, doc_type.builder_fn), (
            f"Module '{doc_type.builder_module}' has no attribute '{doc_type.builder_fn}'"
        )


def test_call_builder_module_has_no_bare_core_prefix():
    """builder_module must start with 'reportforge.' — never bare 'core.'."""
    from reportforge.core.render.doc_registry import REGISTRY

    for key, doc_type in REGISTRY.items():
        assert doc_type.builder_module.startswith("reportforge."), (
            f"REGISTRY['{key}'].builder_module='{doc_type.builder_module}' "
            f"must start with 'reportforge.' — bare 'core.*' fails at runtime"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Grupo D — ?datasource= alias routing
# ─────────────────────────────────────────────────────────────────────────────

_HEADER_ROW = {
    "doc_entry": 1001, "doc_num": 42, "obj_type": "13", "currency": "USD",
    "cliente_nombre": "TEST", "cliente_ruc": "0991234567001",
    "cliente_email": "x@x.com", "cliente_direccion": "Av. Test 1",
    "cliente_tipo_id": "04",
    "total": 112.00, "iva": 12.00, "ambiente": "2",
    "tipo_comprobante": "01", "tipo_emision": "1", "estado_fe": "A",
    "ser_est": "001", "ser_pe": "001", "folio_num": 42,
    "clave_acceso": "0102202001991234567001010010010000000421234567811",
    "numero_autorizacion": "0102202001991234567001010010010000000421234567811",
    "fecha_autorizacion": "2024-01-02T10:00:00", "forma_pago_fe": "01",
}
_LINE_ROW = {
    "codigo": "P001", "descripcion": "Producto", "cantidad": 2.0,
    "precio_unitario": 50.00, "descuento": 0.0, "desc_lineal": 0.0,
    "subtotal": 100.00, "ice_porcentaje": 0.0, "ice_valor": 0.0,
}
_COMPANY_ROW = {
    "razon_social": "EMPRESA DEMO", "ruc": "0991111111001",
    "direccion_matriz": "Av. Principal 100",
}
_LINUX_SPEC = {
    "type": "mssql", "host": "srv", "port": 1433,
    "database": "SBO_DEMO", "username": "sa", "password": "secret",
}


@contextlib.contextmanager
def _register_alias(alias: str, spec: dict):
    from reportforge.core.render.datasource.db_source_registry import register, unregister
    register(alias, spec)
    try:
        yield
    finally:
        unregister(alias)


def test_explicit_datasource_does_not_fall_back_to_sap_b1(client):
    """
    ?datasource=nonexistent_xyz → error must mention that alias, not 'sap_b1'.
    Verifies _resolve_db_spec raises with the requested alias name.
    """
    r = client.get("/document/factura/1?datasource=nonexistent_xyz")
    assert r.status_code == 503, r.text
    body = r.json()
    _assert_error_envelope(body, "DB_CONNECTION_FAILED")
    details = body["error"]["details"]
    assert "nonexistent_xyz" in details, (
        f"error details should name the requested alias, got: {details}"
    )
    assert "sap_b1" not in details, (
        f"error details must not fall back to sap_b1, got: {details}"
    )


def test_explicit_datasource_bypasses_default(client):
    """
    When only sap_b1_linux is registered (not sap_b1), ?datasource=sap_b1_linux → 200.
    Verifies the alias flows all the way to _resolve_db_spec without defaulting.
    """
    mock_sa = MagicMock(side_effect=[[_HEADER_ROW], [_LINE_ROW], [_COMPANY_ROW]])
    with _register_alias("sap_b1_linux", _LINUX_SPEC):
        with patch(_SA_QUERY_TARGET, mock_sa):
            r = client.get("/document/factura/1001?datasource=sap_b1_linux")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["contract"] == _CONTRACT
    assert body["validation"]["schemaOk"] is True


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
