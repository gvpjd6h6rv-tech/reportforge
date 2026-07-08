"""
test_api_routes_sql_commands_happy_path.py

Contract: POST /sql-commands/parse with a valid {?Param} SQL template
returns 200 with prepared_sql (":Name" markers) and the detected
parameter list, using the SAME sql_parameter_parser.parse_parameters()
Fase 3 already ships and tests independently.
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


class TestApiRoutesSqlCommandsHappyPath(unittest.TestCase):

    def test_single_param_returns_prepared_sql_and_parameters(self):
        client = _client()
        r = client.post("/sql-commands/parse", json={"sql": "SELECT DocNum FROM OINV WHERE DocDate >= {?FechaDesde}"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data["valid"])
        self.assertEqual(data["prepared_sql"], "SELECT DocNum FROM OINV WHERE DocDate >= :FechaDesde")
        self.assertEqual(data["parameters"], ["FechaDesde"])
        self.assertEqual(data["bind_order"], ["FechaDesde"])

    def test_two_params_preserve_order(self):
        client = _client()
        sql = "SELECT * FROM OINV WHERE DocDate >= {?FechaDesde} AND DocDate <= {?FechaHasta}"
        r = client.post("/sql-commands/parse", json={"sql": sql})
        data = r.json()
        self.assertEqual(data["parameters"], ["FechaDesde", "FechaHasta"])

    def test_no_params_returns_unchanged_sql(self):
        client = _client()
        r = client.post("/sql-commands/parse", json={"sql": "SELECT TOP 10 CardCode FROM OCRD"})
        data = r.json()
        self.assertTrue(data["valid"])
        self.assertEqual(data["parameters"], [])
        self.assertEqual(data["prepared_sql"], "SELECT TOP 10 CardCode FROM OCRD")


if __name__ == "__main__":
    unittest.main()
