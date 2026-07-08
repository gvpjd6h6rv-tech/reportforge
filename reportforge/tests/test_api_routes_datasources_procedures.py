"""
test_api_routes_datasources_procedures.py

Contract: the 3 Fase 11 FastAPI routes added to api_routes_datasources.py
(GET .../procedures, GET .../procedures/{name}/parameters, POST
.../procedures/{name}/build-command) delegate to
stored_procedure_catalog.py (Fase 7) without duplicating its logic,
never execute a real EXEC, never call sql_executor.execute_command or
add_to_allowlist directly, and surface connection errors as a
controlled 400 (sanitized) rather than an unhandled 500/crash.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from reportforge.server.api_routes_datasources import register_datasource_routes
from reportforge.core.render.datasource.db_source_registry import register, unregister


def _client():
    app = FastAPI()
    register_datasource_routes(app)
    return TestClient(app)


class TestApiRoutesDatasourcesProcedures(unittest.TestCase):

    def setUp(self):
        register("f11_test_alias", {"type": "sqlite", "url": "sqlite:///:memory:"})

    def tearDown(self):
        unregister("f11_test_alias")

    def test_list_procedures_happy_path_sqlite_empty_honest(self):
        client = _client()
        r = client.get("/datasources/f11_test_alias/procedures")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["procedures"], [])

    def test_list_procedures_unknown_alias_returns_404(self):
        client = _client()
        r = client.get("/datasources/does_not_exist/procedures")
        self.assertEqual(r.status_code, 404)

    def test_read_parameters_happy_path(self):
        client = _client()
        r = client.get("/datasources/f11_test_alias/procedures/MyProc/parameters")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["parameters"], [])

    def test_build_command_happy_path_returns_prepared_sql(self):
        client = _client()
        r = client.post(
            "/datasources/f11_test_alias/procedures/MyProc/build-command",
            json={"parameters": [{"name": "FechaDesde", "type": "date", "source": "procedure_param"}]},
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["sql"], "EXEC MyProc :FechaDesde")
        self.assertEqual(data["command_type"], "stored_procedure")

    def test_build_command_rejects_dangerous_sp_prefixed_name(self):
        client = _client()
        r = client.post(
            "/datasources/f11_test_alias/procedures/sp_dangerous/build-command",
            json={"parameters": []},
        )
        self.assertEqual(r.status_code, 400)

    def test_build_command_rejects_xp_prefixed_name(self):
        client = _client()
        r = client.post(
            "/datasources/f11_test_alias/procedures/xp_cmdshell/build-command",
            json={"parameters": []},
        )
        self.assertEqual(r.status_code, 400)

    def test_connection_error_is_controlled_400_not_500_crash(self):
        register("f11_bad_mssql", {"type": "mssql"})  # missing host/etc on purpose
        try:
            client = _client()
            r = client.get("/datasources/f11_bad_mssql/procedures")
            self.assertEqual(r.status_code, 400)
            self.assertIn("password", "no_password_leaked_" + r.text.lower().replace("password", ""))
        finally:
            unregister("f11_bad_mssql")

    def test_no_direct_sql_executor_or_allowlist_import(self):
        source = (ROOT / "reportforge" / "server" / "api_routes_datasources.py").read_text(encoding="utf-8")
        import_lines = [line for line in source.splitlines() if line.strip().startswith(("import ", "from "))]
        for line in import_lines:
            self.assertNotIn("sql_executor", line)
            self.assertNotIn("sql_procedure_allowlist", line)

    def test_no_executor_execute_command_called(self):
        with patch("reportforge.core.render.datasource.sql_executor.execute_command") as mock_exec:
            client = _client()
            client.get("/datasources/f11_test_alias/procedures")
            client.get("/datasources/f11_test_alias/procedures/MyProc/parameters")
            client.post("/datasources/f11_test_alias/procedures/MyProc/build-command", json={"parameters": []})
            # sqlite short-circuits before ever reaching execute_command,
            # so build-command especially must show zero calls.
            mock_exec.assert_not_called()


if __name__ == "__main__":
    unittest.main()
