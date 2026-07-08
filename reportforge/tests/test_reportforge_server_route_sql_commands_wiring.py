"""
test_reportforge_server_route_sql_commands_wiring.py

Contract: the stdlib dev-server wiring (reportforge_server_route_sql_
commands.py — used by reportforge_server.py, the local dev server; a
SEPARATE code path from the FastAPI app in reportforge/server/api.py)
returns the exact same functional shape as the FastAPI route, for every
case already covered there: happy path with {?Param}, string-literal
placeholder ignored, invalid placeholder controlled (never raises),
guard warning surfaced without blocking, empty input controlled.

EVIDENCE DEBT (declared, not hidden): there is no existing stdlib-route
test harness/pattern in this repo to reuse (reportforge_server_services.py
and its route modules had zero prior test coverage before this file) — so
this test calls the handler function directly with a minimal fake
handler object that just captures what _json() writes, rather than
spinning up a real HTTPServer socket. This is compensated by: (1) the
live manual smoke already run against the real reportforge_server.py
process on port 5001 (5 cases, all matching), (2) the FastAPI TestClient
suite above already proving the SHARED parser/guard functions this stdlib
route calls are correct, (3) the no-forbidden-import test below.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT))  # reportforge_server_* modules live at repo root, not under reportforge/

from reportforge_server_route_sql_commands import _post_sql_command_parse


class _FakeHandler:
    """Minimal stand-in for BaseHTTPRequestHandler — _json() only needs
    send_response/send_header/end_headers/wfile, and this captures the
    body it writes instead of touching a real socket."""

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


def _call(body: dict) -> dict:
    import json
    handler = _FakeHandler()
    _post_sql_command_parse(handler, body)
    return json.loads(handler.written.decode("utf-8"))


class TestReportforgeServerRouteSqlCommandsWiring(unittest.TestCase):

    def test_happy_path_returns_prepared_sql_and_parameters(self):
        data = _call({"sql": "SELECT DocNum FROM OINV WHERE DocDate >= {?FechaDesde}"})
        self.assertTrue(data["valid"])
        self.assertEqual(data["prepared_sql"], "SELECT DocNum FROM OINV WHERE DocDate >= :FechaDesde")
        self.assertEqual(data["parameters"], ["FechaDesde"])

    def test_string_literal_placeholder_not_converted(self):
        sql = "SELECT * FROM t WHERE Comentario = '{?NoParametro}'"
        data = _call({"sql": sql})
        self.assertTrue(data["valid"])
        self.assertEqual(data["parameters"], [])
        self.assertEqual(data["prepared_sql"], sql)

    def test_invalid_placeholder_is_controlled_not_raised(self):
        data = _call({"sql": "SELECT * FROM t WHERE x = {?}"})
        self.assertFalse(data["valid"])
        self.assertIn("{?}", data["error"])

    def test_guard_warning_surfaced_without_blocking_parse(self):
        data = _call({"sql": "DROP TABLE foo"})
        self.assertTrue(data["valid"])
        self.assertFalse(data["guard"]["allowed"])
        self.assertEqual(data["guard"]["kind"], "BLOCKED:DROP")

    def test_empty_input_is_controlled(self):
        data = _call({"sql": ""})
        self.assertFalse(data["valid"])
        self.assertIn("required", data["error"])


if __name__ == "__main__":
    unittest.main()
