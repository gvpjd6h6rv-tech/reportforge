"""
test_api_routes_sql_commands_schema.py

Contract: POST /sql-commands/schema (FastAPI) discovers a saved
SqlCommandModel's inferred column schema. Fail-closed parameter contract
(UDS 4.1 Fase 16): required-missing -> 400, extra undeclared -> 400,
optional falls to declared default only, unused-optional-without-default
is silently omitted, raw {?Param} rejected via SqlCommandModel itself,
dangerous SQL rejected via the existing guard, unknown alias -> 404,
connection errors sanitized, response never contains raw rows.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from reportforge.server.api_routes_sql_commands import register_sql_command_routes
from reportforge.core.render.datasource.db_source_registry import register, unregister


def _client():
    app = FastAPI()
    register_sql_command_routes(app)
    return TestClient(app)


SQL_COMMAND = {
    "id": "c1", "name": "c1", "sql": "SELECT 1 AS x, :FechaDesde AS d",
    "command_type": "query",
    "parameters": [{"name": "FechaDesde", "type": "date", "default": None, "required": True, "source": "sql_param"}],
}


class TestApiRoutesSqlCommandsSchema(unittest.TestCase):

    def setUp(self):
        register("f16_test_alias", {"type": "sqlite", "url": "sqlite:///:memory:"})

    def tearDown(self):
        unregister("f16_test_alias")

    def test_happy_path_returns_inferred_columns_no_rows(self):
        client = _client()
        r = client.post("/sql-commands/schema", json={
            "alias": "f16_test_alias", "sql_command": SQL_COMMAND,
            "parameter_values": {"FechaDesde": "2026-01-01"},
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["command_id"], "c1")
        names = [c["name"] for c in data["columns"]]
        self.assertEqual(names, ["x", "d"])
        self.assertNotIn("rows", data)

    def test_required_parameter_missing_returns_400_without_executing(self):
        client = _client()
        r = client.post("/sql-commands/schema", json={
            "alias": "f16_test_alias", "sql_command": SQL_COMMAND, "parameter_values": {},
        })
        self.assertEqual(r.status_code, 400)
        self.assertIn("FechaDesde", r.json()["detail"])

    def test_extra_undeclared_parameter_returns_400(self):
        client = _client()
        r = client.post("/sql-commands/schema", json={
            "alias": "f16_test_alias", "sql_command": SQL_COMMAND,
            "parameter_values": {"FechaDesde": "2026-01-01", "Ghost": "x"},
        })
        self.assertEqual(r.status_code, 400)
        self.assertIn("Ghost", r.json()["detail"])

    def test_optional_parameter_uses_declared_default(self):
        client = _client()
        cmd = {
            "id": "c2", "name": "c2", "sql": "SELECT :Opt AS o",
            "parameters": [{"name": "Opt", "type": "string", "default": "fallback", "required": False, "source": "sql_param"}],
        }
        r = client.post("/sql-commands/schema", json={"alias": "f16_test_alias", "sql_command": cmd, "parameter_values": {}})
        self.assertEqual(r.status_code, 200)

    def test_optional_parameter_no_default_no_value_unused_in_sql_is_silently_omitted(self):
        client = _client()
        cmd = {
            "id": "c3", "name": "c3", "sql": "SELECT 1",
            "parameters": [{"name": "Unused", "type": "string", "default": None, "required": False, "source": "sql_param"}],
        }
        r = client.post("/sql-commands/schema", json={"alias": "f16_test_alias", "sql_command": cmd, "parameter_values": {}})
        self.assertEqual(r.status_code, 200)

    def test_optional_parameter_no_default_no_value_used_in_sql_returns_400(self):
        client = _client()
        cmd = {
            "id": "c4", "name": "c4", "sql": "SELECT :NeedsIt AS x",
            "parameters": [{"name": "NeedsIt", "type": "string", "default": None, "required": False, "source": "sql_param"}],
        }
        r = client.post("/sql-commands/schema", json={"alias": "f16_test_alias", "sql_command": cmd, "parameter_values": {}})
        self.assertEqual(r.status_code, 400)

    def test_raw_crystal_placeholder_rejected_before_any_execution(self):
        client = _client()
        cmd = dict(SQL_COMMAND, sql="SELECT {?FechaDesde}")
        r = client.post("/sql-commands/schema", json={"alias": "f16_test_alias", "sql_command": cmd, "parameter_values": {}})
        self.assertEqual(r.status_code, 400)
        self.assertIn("prepared SQL", r.json()["detail"])

    def test_dangerous_sql_rejected_by_existing_guard(self):
        client = _client()
        cmd = {"id": "c5", "name": "c5", "sql": "DROP TABLE foo", "parameters": []}
        r = client.post("/sql-commands/schema", json={"alias": "f16_test_alias", "sql_command": cmd, "parameter_values": {}})
        self.assertEqual(r.status_code, 400)
        self.assertIn("rejected", r.json()["detail"])

    def test_unknown_alias_returns_404(self):
        client = _client()
        r = client.post("/sql-commands/schema", json={
            "alias": "does_not_exist", "sql_command": SQL_COMMAND, "parameter_values": {"FechaDesde": "x"},
        })
        self.assertEqual(r.status_code, 404)

    def test_connection_error_is_sanitized_400_not_500(self):
        register("f16_bad_mssql", {"type": "mssql", "url": "mssql+pymssql://sa:MyS3cret@127.0.0.1:1/NoSuchDb"})
        try:
            client = _client()
            r = client.post("/sql-commands/schema", json={
                "alias": "f16_bad_mssql", "sql_command": SQL_COMMAND,
                "parameter_values": {"FechaDesde": "2026-01-01"},
            })
            self.assertEqual(r.status_code, 400)
            self.assertNotIn("MyS3cret", r.text)
        finally:
            unregister("f16_bad_mssql")


if __name__ == "__main__":
    unittest.main()
