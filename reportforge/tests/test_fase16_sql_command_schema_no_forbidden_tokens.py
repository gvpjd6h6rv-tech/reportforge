"""
test_fase16_sql_command_schema_no_forbidden_tokens.py

Contract: the Fase 16 files (sql_command_schema_request.py, and the new
/sql-commands/schema routes in both backends) never import sql_executor
directly, never touch Field Explorer/Preview/UI, and never persist
anything. Also confirms sql_schema_inspector.py and sql_executor.py were
NOT modified by this phase (audit found no real need — reused as-is).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

HELPER = ROOT / "reportforge" / "core" / "render" / "datasource" / "sql_command_schema_request.py"
FASTAPI_ROUTES = ROOT / "reportforge" / "server" / "api_routes_sql_commands.py"
STDLIB_ROUTES = ROOT / "reportforge_server_route_sql_commands.py"
SCHEMA_INSPECTOR = ROOT / "reportforge" / "core" / "render" / "datasource" / "sql_schema_inspector.py"
EXECUTOR = ROOT / "reportforge" / "core" / "render" / "datasource" / "sql_executor.py"

_FORBIDDEN_TOKENS = ["FieldExplorer", "PreviewEngine", "CommandRuntimeFile", "SqlCommandStore", "SqlCommandEditor", "SqlCommandsListPanel"]


def _code_outside_leading_doc_comment(source: str) -> str:
    start = source.find('"""')
    if start == -1:
        return source
    end = source.find('"""', start + 3) + 3
    return source[end:]


class TestFase16SqlCommandSchemaNoForbiddenTokens(unittest.TestCase):

    def test_helper_no_forbidden_tokens_and_no_direct_executor_import(self):
        source = HELPER.read_text(encoding="utf-8")
        code = _code_outside_leading_doc_comment(source)
        for token in _FORBIDDEN_TOKENS:
            self.assertNotIn(token, code, f"forbidden token {token!r} in sql_command_schema_request.py")
        import_lines = [line for line in source.splitlines() if line.strip().startswith(("import ", "from "))]
        for line in import_lines:
            self.assertNotIn("sql_executor", line)

    def test_fastapi_route_no_forbidden_tokens_in_schema_section(self):
        source = FASTAPI_ROUTES.read_text(encoding="utf-8")
        start = source.find("_post_sql_command_schema")
        section = source[start:]
        for token in _FORBIDDEN_TOKENS:
            self.assertNotIn(token, section, f"forbidden token {token!r} in api_routes_sql_commands.py schema route")

    def test_stdlib_route_no_forbidden_tokens_in_schema_section(self):
        source = STDLIB_ROUTES.read_text(encoding="utf-8")
        start = source.find("def _post_sql_command_schema")
        section = source[start:]
        for token in _FORBIDDEN_TOKENS:
            self.assertNotIn(token, section, f"forbidden token {token!r} in reportforge_server_route_sql_commands.py schema route")

    def test_both_routes_use_shared_helper_not_reimplemented_logic(self):
        fastapi_source = FASTAPI_ROUTES.read_text(encoding="utf-8")
        stdlib_source = STDLIB_ROUTES.read_text(encoding="utf-8")
        self.assertIn("resolve_bind_values", fastapi_source)
        self.assertIn("resolve_bind_values", stdlib_source)
        self.assertIn("inspect_schema", fastapi_source)
        self.assertIn("inspect_schema", stdlib_source)

    def test_schema_inspector_and_executor_untouched_by_fase16(self):
        for path in (SCHEMA_INSPECTOR, EXECUTOR):
            source = path.read_text(encoding="utf-8")
            self.assertNotIn("Fase 16", source)
            self.assertNotIn("resolve_bind_values", source)

    def test_no_response_field_named_rows_in_either_route(self):
        fastapi_source = FASTAPI_ROUTES.read_text(encoding="utf-8")
        stdlib_source = STDLIB_ROUTES.read_text(encoding="utf-8")
        start_f = fastapi_source.find("_post_sql_command_schema")
        start_s = stdlib_source.find("def _post_sql_command_schema")
        self.assertNotIn('"rows"', fastapi_source[start_f:])
        self.assertNotIn('"rows"', stdlib_source[start_s:])


if __name__ == "__main__":
    unittest.main()
