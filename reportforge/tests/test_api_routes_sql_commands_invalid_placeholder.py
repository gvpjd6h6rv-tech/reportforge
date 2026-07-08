"""
test_api_routes_sql_commands_invalid_placeholder.py

Contract: a malformed {?...} placeholder returns a CONTROLLED 200 response
with valid=false and a clear error message — NEVER a 500, mirroring the
existing /validate-formula precedent (never raises to the client).
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


class TestApiRoutesSqlCommandsInvalidPlaceholder(unittest.TestCase):

    def test_empty_placeholder_returns_200_not_500(self):
        client = _client()
        r = client.post("/sql-commands/parse", json={"sql": "SELECT * FROM t WHERE x = {?}"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertFalse(data["valid"])
        self.assertIn("{?}", data["error"])
        self.assertIsNone(data["prepared_sql"])

    def test_dashed_placeholder_returns_200_not_500(self):
        client = _client()
        r = client.post("/sql-commands/parse", json={"sql": "SELECT * FROM t WHERE x = {?Fecha-Desde}"})
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["valid"])


if __name__ == "__main__":
    unittest.main()
