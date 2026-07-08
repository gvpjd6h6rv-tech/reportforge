"""
test_reportforge_server_route_sql_commands_no_forbidden_imports.py

Contract: reportforge_server_route_sql_commands.py (stdlib dev-server
wiring) never imports sql_executor directly, stored_procedure_catalog,
Field Explorer, Preview, the document serializer, or any exporter.

NOTE: sql_schema_inspector and db_source_registry were originally
forbidden here too (Fase 8: no schema/datasource concept existed in this
file yet). Fase 16 added POST /sql-commands/schema, which legitimately
uses both — see test_reportforge_server_sql_commands_schema.py and
test_fase16_sql_command_schema_no_forbidden_tokens.py for that route's
own contract (never imports sql_executor directly). Same pattern as
Fase 12 superseding Fase 10's narrower "no sqlCommands" restriction.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

MODULE_PATH = ROOT / "reportforge_server_route_sql_commands.py"

_FORBIDDEN_TOKENS = [
    "sql_executor", "stored_procedure_catalog",
    "FieldExplorer", "PreviewEngine", "CommandRuntimeFile",
    "export/", "docx_export", "xlsx_export",
    "pdf_generator", "csv_export", "png_export", "rtf_export",
]


class TestReportforgeServerRouteSqlCommandsNoForbiddenImports(unittest.TestCase):

    def test_no_forbidden_import_statement(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        import_lines = [line for line in source.splitlines() if line.strip().startswith(("import ", "from "))]
        for line in import_lines:
            for token in _FORBIDDEN_TOKENS:
                self.assertNotIn(token, line, f"forbidden import found: {line!r}")

    def test_no_forbidden_token_anywhere_in_executable_code(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        doc_end = source.find('"""', source.find('"""') + 3) + 3
        code_only = source[doc_end:]
        for token in _FORBIDDEN_TOKENS:
            self.assertNotIn(token, code_only, f"forbidden token {token!r} found in executable code")


if __name__ == "__main__":
    unittest.main()
