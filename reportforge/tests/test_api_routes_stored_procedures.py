"""
test_api_routes_stored_procedures.py

Contract: GET /stored-procedures and POST /stored-procedures/execute —
the client sends ONLY {storedProcedureId, params}, never a procedure
name/SQL/datasource alias; every outcome is audited exactly once; a
non-MSSQL datasource stays blocked; no secret ever appears in the
response or audit log.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from reportforge.core.render.datasource import db_source_registry as ds_reg
from reportforge.core.render.datasource import stored_procedure_audit_log as audit
from reportforge.core.render.datasource import stored_procedure_registry as reg
from reportforge.server.api_routes_stored_procedures import register_stored_procedure_routes

_SECRET = "S3cr3tPassw0rd!"
_MSSQL_SPEC = {"type": "mssql", "host": "h", "port": 1433, "database": "d", "username": "u", "password": _SECRET}
_SQLITE_SPEC = {"type": "sqlite", "path": ":memory:"}


def _def(**overrides):
    base = {
        "id": "demo", "label": "Demo", "datasourceId": "ds1", "procedure": "dbo.usp_Demo",
        "enabled": True, "readOnly": True, "timeoutSeconds": 10, "maxRows": 100,
        "params": [{"name": "CardCode", "type": "string", "required": True, "maxLength": 30}],
    }
    base.update(overrides)
    return base


def _mock_pymssql_success(rows):
    fake_cursor = MagicMock()
    fake_cursor.fetchall.return_value = rows
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor
    return patch("pymssql.connect", return_value=fake_conn)


class TestApiRoutesStoredProcedures(unittest.TestCase):

    def setUp(self):
        reg.clear()
        ds_reg._REGISTRY.clear()
        audit.clear()
        app = FastAPI()
        register_stored_procedure_routes(app)
        self.client = TestClient(app)

    def tearDown(self):
        reg.clear()
        ds_reg._REGISTRY.clear()

    # --- GET /stored-procedures -----------------------------------------------------

    def test_list_returns_only_enabled(self):
        reg.register_definition(_def(id="a", enabled=True))
        reg.register_definition(_def(id="b", enabled=False))
        body = self.client.get("/stored-procedures").json()
        ids = [p["id"] for p in body["storedProcedures"]]
        self.assertEqual(ids, ["a"])

    def test_list_never_exposes_datasource_or_procedure_name(self):
        reg.register_definition(_def())
        body = self.client.get("/stored-procedures").json()
        self.assertNotIn("datasourceId", body["storedProcedures"][0])
        self.assertNotIn("procedure", body["storedProcedures"][0])

    def test_empty_allowlist_returns_empty_list_not_error(self):
        resp = self.client.get("/stored-procedures")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["storedProcedures"], [])

    # --- POST /stored-procedures/execute -----------------------------------------------------

    def test_execute_requires_stored_procedure_id(self):
        resp = self.client.post("/stored-procedures/execute", json={"params": {}})
        self.assertEqual(resp.json()["status"], "blocked")

    def test_execute_success_returns_rows(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with _mock_pymssql_success([{"Name": "Acme"}]):
            resp = self.client.post("/stored-procedures/execute", json={
                "storedProcedureId": "demo", "params": {"CardCode": "C001"},
            })
        body = resp.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["row_count"], 1)

    def test_execute_unknown_id_blocked(self):
        resp = self.client.post("/stored-procedures/execute", json={
            "storedProcedureId": "nope", "params": {},
        })
        self.assertEqual(resp.json()["status"], "blocked")

    def test_execute_extra_param_blocked_without_connecting(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with patch("pymssql.connect") as mock_connect:
            resp = self.client.post("/stored-procedures/execute", json={
                "storedProcedureId": "demo", "params": {"CardCode": "C001", "evil": "x"},
            })
            self.assertEqual(resp.json()["status"], "blocked")
            mock_connect.assert_not_called()

    def test_execute_missing_required_param_blocked(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        resp = self.client.post("/stored-procedures/execute", json={
            "storedProcedureId": "demo", "params": {},
        })
        self.assertEqual(resp.json()["status"], "blocked")

    def test_execute_sqlite_datasource_blocked(self):
        # F19 contract: only structured-MSSQL is executable; a datasource
        # outside that contract stays blocked even if the SP definition
        # references it.
        reg.register_definition(_def())
        ds_reg.register("ds1", _SQLITE_SPEC)
        resp = self.client.post("/stored-procedures/execute", json={
            "storedProcedureId": "demo", "params": {"CardCode": "C001"},
        })
        self.assertEqual(resp.json()["status"], "blocked")

    def test_raw_procedure_field_in_body_is_ignored(self):
        # Item 13: even if a client sends a raw "procedure" field trying
        # to override the allowlisted one, it is never read anywhere in
        # the route — only storedProcedureId drives the lookup.
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with _mock_pymssql_success([{"Name": "Acme"}]):
            resp = self.client.post("/stored-procedures/execute", json={
                "storedProcedureId": "demo", "procedure": "dbo.usp_Malicious",
                "params": {"CardCode": "C001"},
            })
        self.assertEqual(resp.json()["status"], "success")

    def test_sql_text_in_param_value_is_bound_not_executed(self):
        # Item 15: a param VALUE that looks like SQL is just a string
        # bound value — never concatenated/executed as a statement.
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with patch("reportforge.core.render.datasource.stored_procedure_executor.execute_command") as mock_exec:
            mock_exec.return_value = MagicMock(row_count=0, rows=[], columns=[], warnings=[])
            self.client.post("/stored-procedures/execute", json={
                "storedProcedureId": "demo", "params": {"CardCode": "x'; DROP TABLE OINV; --"},
            })
        sql_sent = mock_exec.call_args.args[1]
        self.assertNotIn("DROP TABLE", sql_sent)

    def test_every_outcome_produces_exactly_one_audit_entry(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        self.assertEqual(len(audit.recent(50)), 0)
        with _mock_pymssql_success([{"Name": "Acme"}]):
            self.client.post("/stored-procedures/execute", json={
                "storedProcedureId": "demo", "params": {"CardCode": "C001"},
            })
        self.assertEqual(len(audit.recent(50)), 1)

    def test_blocked_outcome_is_audited(self):
        resp = self.client.post("/stored-procedures/execute", json={
            "storedProcedureId": "nope", "params": {},
        })
        self.assertEqual(resp.json()["status"], "blocked")
        entry = audit.recent(1)[0]
        self.assertEqual(entry["status"], "blocked")

    def test_error_outcome_is_audited(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with patch("pymssql.connect", side_effect=RuntimeError("Adaptive Server is unavailable")):
            resp = self.client.post("/stored-procedures/execute", json={
                "storedProcedureId": "demo", "params": {"CardCode": "C001"},
            })
        self.assertEqual(resp.json()["status"], "error")
        entry = audit.recent(1)[0]
        self.assertEqual(entry["status"], "error")

    def test_password_never_appears_in_response(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with _mock_pymssql_success([{"Name": "Acme"}]):
            resp = self.client.post("/stored-procedures/execute", json={
                "storedProcedureId": "demo", "params": {"CardCode": "C001"},
            })
        self.assertNotIn(_SECRET, resp.text)

    def test_password_never_appears_in_audit_log(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with patch("pymssql.connect", side_effect=RuntimeError("connection refused")):
            self.client.post("/stored-procedures/execute", json={
                "storedProcedureId": "demo", "params": {"CardCode": "C001"},
            })
        for entry in audit.recent(50):
            self.assertNotIn(_SECRET, str(entry))


if __name__ == "__main__":
    unittest.main()
