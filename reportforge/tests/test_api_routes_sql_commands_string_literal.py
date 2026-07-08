"""
test_api_routes_sql_commands_string_literal.py

Contract: a {?Param}-shaped token INSIDE a string literal is not
converted/extracted — the endpoint surfaces sql_parameter_parser's own
string-literal awareness (Fase 3 + GAP-1/GAP-2 fixes), not a
reimplementation.
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


def _client():
    app = FastAPI()
    register_sql_command_routes(app)
    return TestClient(app)


class TestApiRoutesSqlCommandsStringLiteral(unittest.TestCase):

    def test_placeholder_inside_string_literal_is_not_converted(self):
        client = _client()
        sql = "SELECT * FROM t WHERE Comentario = '{?NoParametro}'"
        r = client.post("/sql-commands/parse", json={"sql": sql})
        data = r.json()
        self.assertTrue(data["valid"])
        self.assertEqual(data["parameters"], [])
        self.assertEqual(data["prepared_sql"], sql)

    def test_real_param_outside_string_still_detected_alongside_one_inside(self):
        client = _client()
        sql = "SELECT * FROM t WHERE Comentario = '{?NoParametro}' AND CardCode = {?CardCode}"
        r = client.post("/sql-commands/parse", json={"sql": sql})
        data = r.json()
        self.assertEqual(data["parameters"], ["CardCode"])
        self.assertIn("'{?NoParametro}'", data["prepared_sql"])
        self.assertIn(":CardCode", data["prepared_sql"])


if __name__ == "__main__":
    unittest.main()
