"""
test_api_routes_sql_command_execution.py

Contract: POST /sql-commands/execute — see
api_routes_sql_command_execution.py's own docstring for the full
contract. This file verifies the endpoint-level guardrails from F19B-1A's
brief (items 5-15 of its "Tests mínimos" list):

  5.  rejects without datasource_alias
  6.  rejects without explicit confirmation
  7.  rejects a url-shaped (or sqlite) datasource — structured-MSSQL only
  8.  blocks INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/MERGE
  9.  blocks multi-statement
  10. blocks EXEC / stored_procedure command_type
  11. uses sql_executor.execute_command, never query_registered (R5 avoided)
  12. applies the structured-MSSQL path (real routing, mocked driver)
  13. resolved timeout reaches the driver (mocked, kwargs captured)
  14. stored procedures stay out
  15. password never appears in the response body or the audit log

No real network connection is attempted anywhere in this file — pymssql
is always mocked, exactly like the existing F19B-0 test suite
(test_sql_executor_guard_blocks_structured_mssql_before_connect.py,
test_sql_executor_structured_mssql_timeout_reaches_driver.py).
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

from reportforge.core.render.datasource import db_source_registry as reg
from reportforge.core.render.datasource import sql_execution_audit_log as audit
from reportforge.server.api_routes_sql_command_execution import register_sql_command_execution_routes

_SECRET = "S3cr3tPassw0rd!"

_STRUCTURED_MSSQL_SPEC = {
    "type": "mssql", "host": "fake-host", "port": 1433,
    "database": "fakedb", "username": "fakeuser", "password": _SECRET,
    "ttl": 0,
}

_URL_SHAPED_SPEC = {"type": "mssql", "url": "mssql+pymssql://sa:x@host/db"}
_SQLITE_SPEC = {"type": "sqlite", "path": ":memory:"}


def _select_command(**overrides):
    cmd = {
        "id": "c1", "name": "Ventas", "sql": "SELECT DocNum FROM OINV",
        "command_type": "query", "parameters": [], "result_schema": [], "max_rows_preview": 100,
    }
    cmd.update(overrides)
    return cmd


def _mock_pymssql_success(rows):
    fake_cursor = MagicMock()
    fake_cursor.fetchall.return_value = rows
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor
    return patch("pymssql.connect", return_value=fake_conn)


class TestApiRoutesSqlCommandExecution(unittest.TestCase):

    def setUp(self):
        reg._REGISTRY.clear()
        audit.clear()
        app = FastAPI()
        register_sql_command_execution_routes(app)
        self.client = TestClient(app)

    # --- 5/6: alias + confirmation required -----------------------------------------------------

    def test_rejects_without_alias(self):
        resp = self.client.post("/sql-commands/execute", json={"confirm": True, "sql_command": _select_command()})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "blocked")

    def test_rejects_without_confirmation(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        resp = self.client.post("/sql-commands/execute", json={"alias": "ds1", "sql_command": _select_command()})
        self.assertEqual(resp.json()["status"], "blocked")
        entry = audit.recent(1)[0]
        self.assertFalse(entry["confirmation_present"])

    def test_rejects_alias_not_found(self):
        resp = self.client.post("/sql-commands/execute", json={"alias": "nope", "confirm": True, "sql_command": _select_command()})
        self.assertEqual(resp.json()["status"], "blocked")

    # --- 7: structured-MSSQL only -----------------------------------------------------

    def test_rejects_url_shaped_datasource(self):
        reg.register("ds_url", _URL_SHAPED_SPEC)
        resp = self.client.post("/sql-commands/execute", json={"alias": "ds_url", "confirm": True, "sql_command": _select_command()})
        body = resp.json()
        self.assertEqual(body["status"], "blocked")
        self.assertIn("structured MSSQL", body["reason"])

    def test_rejects_sqlite_datasource(self):
        reg.register("ds_sqlite", _SQLITE_SPEC)
        resp = self.client.post("/sql-commands/execute", json={"alias": "ds_sqlite", "confirm": True, "sql_command": _select_command()})
        self.assertEqual(resp.json()["status"], "blocked")

    # --- 8/9: DML/DDL and multi-statement blocked, no connection attempted -----------------------------------------------------

    def test_blocks_destructive_statements_without_connecting(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        for kw in ("INSERT INTO OINV VALUES (1)", "UPDATE OINV SET DocTotal=0", "DELETE FROM OINV",
                   "DROP TABLE OINV", "ALTER TABLE OINV ADD x INT", "TRUNCATE TABLE OINV",
                   "MERGE INTO OINV USING x ON 1=1 WHEN MATCHED THEN UPDATE SET DocTotal=0"):
            with patch("pymssql.connect") as mock_connect:
                resp = self.client.post("/sql-commands/execute", json={
                    "alias": "ds1", "confirm": True, "sql_command": _select_command(sql=kw),
                })
                self.assertEqual(resp.json()["status"], "blocked", msg=kw)
                mock_connect.assert_not_called()

    def test_blocks_multi_statement_without_connecting(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with patch("pymssql.connect") as mock_connect:
            resp = self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True,
                "sql_command": _select_command(sql="SELECT 1; DROP TABLE OINV"),
            })
            self.assertEqual(resp.json()["status"], "blocked")
            mock_connect.assert_not_called()

    # --- 10/14: EXEC / stored procedures stay out -----------------------------------------------------

    def test_blocks_raw_exec_sql_without_connecting(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with patch("pymssql.connect") as mock_connect:
            resp = self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True,
                "sql_command": _select_command(sql="EXEC sp_helpdb"),
            })
            self.assertEqual(resp.json()["status"], "blocked")
            mock_connect.assert_not_called()

    def test_blocks_stored_procedure_command_type_without_connecting(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with patch("pymssql.connect") as mock_connect:
            resp = self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True,
                "sql_command": _select_command(sql="EXEC MiReporteVentas", command_type="stored_procedure"),
            })
            self.assertEqual(resp.json()["status"], "blocked")
            mock_connect.assert_not_called()

    # --- 11: R5 avoided — query_registered never used -----------------------------------------------------

    def test_source_never_imports_query_registered(self):
        # Line-based, matching the same pattern already established by
        # test_api_routes_sql_commands_no_executor_import.py — only actual
        # import statements are checked, never the module's own prose
        # docstring (which legitimately documents R5 by NAME, explaining
        # why query_registered is avoided).
        source = (ROOT / "reportforge" / "server" / "api_routes_sql_command_execution.py").read_text(encoding="utf-8")
        import_lines = [line for line in source.splitlines() if line.strip().startswith(("import ", "from "))]
        for line in import_lines:
            self.assertNotIn("query_registered", line, f"forbidden import found: {line!r}")

    def test_query_registered_is_never_called_on_the_happy_path(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with _mock_pymssql_success([{"DocNum": 1}]), \
             patch("reportforge.core.render.datasource.db_source_registry.query_registered") as mock_qr:
            resp = self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True, "sql_command": _select_command(),
            })
            self.assertEqual(resp.json()["status"], "success")
            mock_qr.assert_not_called()

    # --- 12/13: structured-MSSQL routing + timeout reaches the driver -----------------------------------------------------

    def test_applies_structured_mssql_path_and_returns_rows(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with _mock_pymssql_success([{"DocNum": 1}, {"DocNum": 2}]):
            resp = self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True, "sql_command": _select_command(),
            })
        body = resp.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["row_count"], 2)

    def test_response_echoes_max_rows_and_timeout_effective_on_success(self):
        # F19B-1B gap fix: the UI's own contract requires showing the
        # ACTUALLY-applied max_rows/timeout, so the response must carry
        # them — not just the internal audit log.
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with _mock_pymssql_success([{"DocNum": 1}]):
            resp = self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True,
                "sql_command": _select_command(max_rows_preview=50), "timeout": 22,
            })
        body = resp.json()
        self.assertEqual(body["max_rows_effective"], 50)
        self.assertEqual(body["timeout_effective"], 22)

    def test_response_echoes_max_rows_and_timeout_effective_when_guard_blocked(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        resp = self.client.post("/sql-commands/execute", json={
            "alias": "ds1", "confirm": True,
            "sql_command": _select_command(sql="DROP TABLE OINV"),
        })
        body = resp.json()
        self.assertIn("max_rows_effective", body)
        self.assertIn("timeout_effective", body)

    def test_empty_result_is_classified_as_empty_not_success(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with _mock_pymssql_success([]):
            resp = self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True, "sql_command": _select_command(),
            })
        self.assertEqual(resp.json()["status"], "empty")

    def test_resolved_timeout_reaches_the_driver(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with _mock_pymssql_success([{"x": 1}]) as _:
            with patch("pymssql.connect", return_value=MagicMock(cursor=lambda: MagicMock(fetchall=lambda: [{"x": 1}]))) as mock_connect:
                self.client.post("/sql-commands/execute", json={
                    "alias": "ds1", "confirm": True, "sql_command": _select_command(), "timeout": 21,
                })
        kwargs = mock_connect.call_args.kwargs
        self.assertEqual(kwargs.get("login_timeout"), 21)
        self.assertEqual(kwargs.get("timeout"), 21)

    def test_connection_error_is_classified_and_audited(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with patch("pymssql.connect", side_effect=RuntimeError("Adaptive Server is unavailable")):
            resp = self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True, "sql_command": _select_command(),
            })
        self.assertEqual(resp.json()["status"], "error")
        entry = audit.recent(1)[0]
        self.assertEqual(entry["status"], "error")

    # --- 15: password never leaks -----------------------------------------------------

    def test_password_never_appears_in_the_error_response(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with patch("pymssql.connect", side_effect=RuntimeError("connection refused")):
            resp = self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True, "sql_command": _select_command(),
            })
        self.assertNotIn(_SECRET, resp.text)

    def test_password_never_appears_in_the_audit_log(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with patch("pymssql.connect", side_effect=RuntimeError("connection refused")):
            self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True, "sql_command": _select_command(),
            })
        for entry in audit.recent(50):
            self.assertNotIn(_SECRET, str(entry))

    def test_password_never_appears_in_the_success_response(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        with _mock_pymssql_success([{"DocNum": 1}]):
            resp = self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True, "sql_command": _select_command(),
            })
        self.assertNotIn(_SECRET, resp.text)
        self.assertNotIn("password", resp.json())

    def test_every_outcome_produces_exactly_one_audit_entry(self):
        reg.register("ds1", _STRUCTURED_MSSQL_SPEC)
        self.assertEqual(len(audit.recent(50)), 0)
        with _mock_pymssql_success([{"DocNum": 1}]):
            self.client.post("/sql-commands/execute", json={
                "alias": "ds1", "confirm": True, "sql_command": _select_command(),
            })
        self.assertEqual(len(audit.recent(50)), 1)


if __name__ == "__main__":
    unittest.main()
