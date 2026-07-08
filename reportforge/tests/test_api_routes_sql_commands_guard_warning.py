"""
test_api_routes_sql_commands_guard_warning.py

Contract: a destructive/risky SQL command still parses successfully
(valid=true — the SYNTAX is fine) but the "guard" field reports
allowed=false with a reason/kind — informational feedback ONLY, never a
block on the parse response, and never an execution attempt.
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


class TestApiRoutesSqlCommandsGuardWarning(unittest.TestCase):

    def test_drop_table_reports_guard_blocked(self):
        client = _client()
        r = client.post("/sql-commands/parse", json={"sql": "DROP TABLE foo"})
        data = r.json()
        self.assertTrue(data["valid"])  # parses fine, it's just not allowed to RUN
        self.assertFalse(data["guard"]["allowed"])
        self.assertEqual(data["guard"]["kind"], "BLOCKED:DROP")

    def test_select_reports_guard_allowed(self):
        client = _client()
        r = client.post("/sql-commands/parse", json={"sql": "SELECT 1"})
        data = r.json()
        self.assertTrue(data["guard"]["allowed"])
        self.assertEqual(data["guard"]["kind"], "SELECT")


if __name__ == "__main__":
    unittest.main()
