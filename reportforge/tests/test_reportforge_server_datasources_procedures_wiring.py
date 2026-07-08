"""
test_reportforge_server_datasources_procedures_wiring.py

Contract: the stdlib dev-server wiring for the 3 Fase 11 procedure
routes (reportforge_server_datasources.py, used by reportforge_server.py
— a SEPARATE code path from the FastAPI app) mirrors the FastAPI
contract: happy path, unknown alias controlled error, dangerous name
rejection, and — the real bug found during live smoke — a connection
error is caught and returned as a controlled error instead of leaving
the request hanging with no response at all.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT))  # reportforge_server_* modules live at repo root

from reportforge_server_datasources import (
    _get_ds_procedures, _get_ds_procedure_parameters, _post_ds_procedure_build_command,
)
from reportforge.core.render.datasource.db_source_registry import register, unregister


class _FakeHandler:
    def __init__(self):
        self.status = None
        self.headers = {}
        self.written = b""

    def send_response(self, status):
        self.status = status

    def send_header(self, key, value):
        self.headers[key] = value

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


def _call(fn, *args):
    handler = _FakeHandler()
    fn(handler, *args)
    return handler.status, json.loads(handler.written.decode("utf-8"))


class TestReportforgeServerDatasourcesProceduresWiring(unittest.TestCase):

    def setUp(self):
        register("f11_stdlib_alias", {"type": "sqlite", "url": "sqlite:///:memory:"})

    def tearDown(self):
        unregister("f11_stdlib_alias")

    def test_list_procedures_happy_path(self):
        status, body = _call(_get_ds_procedures, "f11_stdlib_alias")
        self.assertEqual(status, 200)
        self.assertEqual(body["procedures"], [])

    def test_list_procedures_unknown_alias_controlled_error(self):
        status, body = _call(_get_ds_procedures, "no_such_alias")
        self.assertEqual(status, 404)
        self.assertIn("not found", body["error"])

    def test_read_parameters_happy_path(self):
        status, body = _call(_get_ds_procedure_parameters, "f11_stdlib_alias", "MyProc")
        self.assertEqual(status, 200)
        self.assertEqual(body["parameters"], [])

    def test_build_command_returns_prepared_sql(self):
        status, body = _call(
            _post_ds_procedure_build_command, "f11_stdlib_alias", "MyProc",
            {"parameters": [{"name": "FechaDesde", "type": "date", "source": "procedure_param"}]},
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["sql"], "EXEC MyProc :FechaDesde")

    def test_build_command_rejects_dangerous_name(self):
        status, body = _call(_post_ds_procedure_build_command, "f11_stdlib_alias", "xp_cmdshell", {"parameters": []})
        self.assertEqual(status, 400)

    def test_connection_error_is_controlled_not_hanging(self):
        # RF-STORED-PROC-PICKER-STDLIB-1: this is the exact bug found
        # during live Playwright smoke — an unreachable/misconfigured
        # mssql datasource used to raise unhandled inside
        # list_procedures(), which on the stdlib http.server left the
        # HTTP request with literally zero bytes written (Chrome reports
        # ERR_EMPTY_RESPONSE). Now it must resolve to a normal, fast,
        # sanitized 400 — proving the fix, not just its absence of crash.
        register("f11_bad_mssql_stdlib", {"type": "mssql"})
        try:
            status, body = _call(_get_ds_procedures, "f11_bad_mssql_stdlib")
            self.assertEqual(status, 400)
            self.assertIn("error", body)
        finally:
            unregister("f11_bad_mssql_stdlib")


if __name__ == "__main__":
    unittest.main()
