"""Tests for core.models.invoice_model::build_invoice_model's empresa block.

Single responsibility: verify razon_social/nombre_comercial resolve from the
correct OADM column for this installation, and that razon_social never falls
back to the trade-name value.

RF-EMPRESA-RAZON-SOCIAL-VS-COMERCIAL-1: confirmed against the live OADM row —
OADM.AliasName holds the SRI-registered fiscal razón social
("CAROLINA JULIA CHANG AJOY CHONG"), OADM.CompnyName holds the trade/
commercial name ("SUPER MOTOS Y BICICLETAS"). The original query
(CompnyName AS razon_social) put the trade name into the layout's
fiscal-legal-name slot — a source mapping bug, not a legitimate reading of
that column. fetch_company_info (invoice_queries.py::_COMPANY_SQL) now maps
AliasName -> razon_social, CompnyName -> nombre_comercial; build_invoice_model
must pass those straight through with NO cross-fallback (a blank fiscal name
must stay blank, never silently show the trade name instead).
"""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from reportforge.core.models import invoice_model  # noqa: E402


def _header(**overrides) -> dict:
    base = {
        "doc_entry": 1, "doc_num": 9501, "obj_type": "13", "currency": "USD",
        "cliente_nombre": "HUANG XIRU", "cliente_ruc": "1311940512001",
        "cliente_email": "", "cliente_direccion": "", "cliente_telefono": "",
        "cliente_telefono2": "", "cliente_tipo_id": "", "plazo": "",
        "doc_date": "2026-04-24", "doc_time": 1240, "total": 106.41, "iva": 0.0,
        "comments": "", "ambiente": "2", "tipo_comprobante": "01", "tipo_emision": "1",
        "estado_fe": "", "codigo_error": "", "descripcion_error": "",
        "pdf_generado": "", "mail_enviado": "", "ser_est": "001", "ser_pe": "101",
        "correlativo": "9501", "folio_num": 9501, "clave_acceso": "CLAVE",
        "numero_autorizacion": "CLAVE", "fecha_autorizacion": "2026-04-24",
        "forma_pago_fe": "01",
    }
    base.update(overrides)
    return base


def _company(**overrides) -> dict:
    # Mirrors the real OADM row for this installation, post-swap:
    # razon_social <- AliasName, nombre_comercial <- CompnyName.
    base = {
        "razon_social": "CAROLINA JULIA CHANG AJOY CHONG",
        "nombre_comercial": "SUPER MOTOS Y BICICLETAS",
        "ruc": "0913042669001", "direccion_matriz": "COLON 426", "pais": "EC",
        "telefono": "2530152", "email": "supermotosybicicletas@gmail.com",
    }
    base.update(overrides)
    return base


class TestEmpresaRazonSocialNeverFallsBackToTradeName(unittest.TestCase):
    def _build(self, header_overrides=None, company_overrides=None):
        with mock.patch.object(invoice_model, "_resolve_db_spec", return_value={}), \
             mock.patch.object(invoice_model, "fetch_invoice_header",
                               return_value=_header(**(header_overrides or {}))), \
             mock.patch.object(invoice_model, "fetch_invoice_lines", return_value=[]), \
             mock.patch.object(invoice_model, "fetch_company_info",
                               return_value=_company(**(company_overrides or {}))), \
             mock.patch.object(invoice_model, "fetch_guia_referencias", return_value=None):
            return invoice_model.build_invoice_model(9501)

    def test_razon_social_is_the_fiscal_name_not_the_trade_name(self):
        model = self._build()
        self.assertEqual(model["empresa"]["razon_social"], "CAROLINA JULIA CHANG AJOY CHONG")
        self.assertEqual(model["empresa"]["nombre_comercial"], "SUPER MOTOS Y BICICLETAS")
        self.assertNotEqual(model["empresa"]["razon_social"], "SUPER MOTOS Y BICICLETAS")

    def test_blank_fiscal_name_stays_blank_no_fallback_to_trade_name(self):
        # If the fiscal name is genuinely blank, leaving it blank is correct
        # — falling back to nombre_comercial would reintroduce the collision.
        model = self._build(company_overrides={"razon_social": ""})
        self.assertEqual(model["empresa"]["razon_social"], "")
        self.assertNotEqual(model["empresa"]["razon_social"], "SUPER MOTOS Y BICICLETAS")


class TestCompanySqlSourceMapping(unittest.TestCase):
    """Guards the SQL text itself against regressing to the collision.

    Both RF's independent SQL paths (factura via invoice_queries.py, guia via
    remision_queries.py) query OADM directly for empresa data — each has its
    own _COMPANY_SQL, so both must be checked.
    """

    @staticmethod
    def _normalized(sql: str) -> str:
        return " ".join(sql.split())

    def test_invoice_queries_company_sql_maps_alias_to_razon_social(self):
        from reportforge.core.models import invoice_queries
        sql = self._normalized(invoice_queries._COMPANY_SQL)
        self.assertIn("AliasName AS razon_social", sql)
        self.assertIn("CompnyName AS nombre_comercial", sql)
        self.assertNotIn("CompnyName AS razon_social", sql)

    def test_remision_queries_company_sql_maps_alias_to_razon_social(self):
        from reportforge.core.models import remision_queries
        sql = self._normalized(remision_queries._COMPANY_SQL)
        self.assertIn("AliasName AS razon_social", sql)
        self.assertIn("CompnyName AS nombre_comercial", sql)
        self.assertNotIn("CompnyName AS razon_social", sql)


if __name__ == "__main__":
    unittest.main()
