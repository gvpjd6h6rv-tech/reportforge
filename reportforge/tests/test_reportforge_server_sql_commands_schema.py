"""
test_reportforge_server_sql_commands_schema.py

Contract: the stdlib dev-server wiring for POST /sql-commands/schema
(reportforge_server_route_sql_commands.py, used by reportforge_server.py)
mirrors the FastAPI contract exactly: same fail-closed parameter rules,
same 404/400/200 status mapping, same sanitized errors, same shared
resolve_bind_values()/inspect_schema() calls (not a reimplementation).
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT))  # reportforge_server_* modules live at repo root

from reportforge_server_route_sql_commands import _post_sql_command_schema
from reportforge.core.render.datasource.db_source_registry import register, unregister


class _FakeHandler:
    def __init__(self):
        self.status = None
        self.written = b""

    def send_response(self, status):
        self.status = status

    def send_header(self, key, value):
        pass

    def end_headers(self):
        pass

    class _Wfile:
        def __init__(self, outer):
            self._outer = outer

        def write(self, data):
            self._outer.written += data

    @property
    def wfile(self):
        return self._Wfile(self)


def _call(body: dict):
    handler = _FakeHandler()
    _post_sql_command_schema(handler, body)
    return handler.status, json.loads(handler.written.decode("utf-8"))


SQL_COMMAND = {
    "id": "c1", "name": "c1", "sql": "SELECT 1 AS x, :FechaDesde AS d",
    "command_type": "query",
    "parameters": [{"name": "FechaDesde", "type": "date", "default": None, "required": True, "source": "sql_param"}],
}


class TestReportforgeServerSqlCommandsSchema(unittest.TestCase):

    def setUp(self):
        register("f16_stdlib_alias", {"type": "sqlite", "url": "sqlite:///:memory:"})

    def tearDown(self):
        unregister("f16_stdlib_alias")

    def test_happy_path_returns_inferred_columns(self):
        status, body = _call({
            "alias": "f16_stdlib_alias", "sql_command": SQL_COMMAND,
            "parameter_values": {"FechaDesde": "2026-01-01"},
        })
        self.assertEqual(status, 200)
        self.assertEqual([c["name"] for c in body["columns"]], ["x", "d"])

    def test_required_parameter_missing_returns_400(self):
        status, body = _call({"alias": "f16_stdlib_alias", "sql_command": SQL_COMMAND, "parameter_values": {}})
        self.assertEqual(status, 400)
        self.assertIn("FechaDesde", body["error"])

    def test_extra_undeclared_parameter_returns_400(self):
        status, body = _call({
            "alias": "f16_stdlib_alias", "sql_command": SQL_COMMAND,
            "parameter_values": {"FechaDesde": "2026-01-01", "Ghost": "x"},
        })
        self.assertEqual(status, 400)
        self.assertIn("Ghost", body["error"])

    def test_raw_crystal_placeholder_rejected(self):
        cmd = dict(SQL_COMMAND, sql="SELECT {?FechaDesde}")
        status, body = _call({"alias": "f16_stdlib_alias", "sql_command": cmd, "parameter_values": {}})
        self.assertEqual(status, 400)
        self.assertIn("prepared SQL", body["error"])

    def test_dangerous_sql_rejected(self):
        cmd = {"id": "c5", "name": "c5", "sql": "DROP TABLE foo", "parameters": []}
        status, body = _call({"alias": "f16_stdlib_alias", "sql_command": cmd, "parameter_values": {}})
        self.assertEqual(status, 400)

    def test_unknown_alias_returns_404(self):
        status, body = _call({"alias": "nope", "sql_command": SQL_COMMAND, "parameter_values": {"FechaDesde": "x"}})
        self.assertEqual(status, 404)

    def test_connection_error_is_sanitized(self):
        register("f16_stdlib_bad_mssql", {"type": "mssql", "url": "mssql+pymssql://sa:MyS3cret@127.0.0.1:1/NoSuchDb"})
        try:
            status, body = _call({
                "alias": "f16_stdlib_bad_mssql", "sql_command": SQL_COMMAND,
                "parameter_values": {"FechaDesde": "2026-01-01"},
            })
            self.assertEqual(status, 400)
            self.assertNotIn("MyS3cret", json.dumps(body))
        finally:
            unregister("f16_stdlib_bad_mssql")


if __name__ == "__main__":
    unittest.main()
