"""
test_api_routes_sql_commands_no_executor_import.py

Contract: api_routes_sql_commands.py never imports sql_executor directly
or stored_procedure_catalog — verified statically. The zero-calls-to-
execute_command dynamic check below covers ONLY /sql-commands/parse
(which truly never executes anything).

NOTE: db_source_registry and sql_schema_inspector were originally in the
forbidden-import list too (Fase 8: this file only parsed/validated raw
SQL, no datasource/schema concept existed here yet). Fase 16 added
POST /sql-commands/schema, which legitimately resolves a registered
alias (db_source_registry.get_registered) and delegates to
sql_schema_inspector.inspect_schema() for a SAFE, guarded, limited
preview — see test_api_routes_sql_commands_schema.py and
test_fase16_sql_command_schema_no_forbidden_tokens.py for that route's
own contract (never imports sql_executor directly, fail-closed
parameters, sanitized errors). Removing these two tokens here is not a
regression: it reflects Fase 16 intentionally superseding Fase 8's
narrower scope, the same pattern already used when Fase 12 superseded
Fase 10's "no sqlCommands" restriction.
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
    "sql_executor", "stored_procedure_catalog", "FieldExplorer",
    "PreviewEngine", "CommandRuntimeFile",
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
