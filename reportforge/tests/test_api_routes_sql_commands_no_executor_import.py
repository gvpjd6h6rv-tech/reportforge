"""
test_api_routes_sql_commands_no_executor_import.py

Contract: api_routes_sql_commands.py never imports or calls sql_executor,
db_source_registry, sql_schema_inspector, or stored_procedure_catalog —
verified both statically (no import statement) and dynamically (a spy on
sql_executor.execute_command confirms zero calls across every request
shape this module handles).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

MODULE_PATH = ROOT / "reportforge" / "server" / "api_routes_sql_commands.py"

_FORBIDDEN_IMPORT_TOKENS = [
    "sql_executor", "db_source_registry", "sql_schema_inspector",
    "stored_procedure_catalog", "FieldExplorer", "PreviewEngine",
    "CommandRuntimeFile",
]


class TestApiRoutesSqlCommandsNoExecutorImport(unittest.TestCase):

    def test_no_forbidden_import_statement(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        import_lines = [line for line in source.splitlines() if line.strip().startswith(("import ", "from "))]
        for line in import_lines:
            for token in _FORBIDDEN_IMPORT_TOKENS:
                self.assertNotIn(token, line, f"forbidden import found: {line!r}")

    def test_execute_command_is_never_called_across_all_request_shapes(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from reportforge.server.api_routes_sql_commands import register_sql_command_routes

        app = FastAPI()
        register_sql_command_routes(app)
        client = TestClient(app)

        with patch("reportforge.core.render.datasource.sql_executor.execute_command") as mock_exec:
            client.post("/sql-commands/parse", json={"sql": "SELECT DocNum FROM OINV WHERE DocDate >= {?FechaDesde}"})
            client.post("/sql-commands/parse", json={"sql": "DROP TABLE foo"})
            client.post("/sql-commands/parse", json={"sql": "SELECT * FROM t WHERE x = {?}"})
            client.post("/sql-commands/parse", json={"sql": ""})
            mock_exec.assert_not_called()


if __name__ == "__main__":
    unittest.main()
