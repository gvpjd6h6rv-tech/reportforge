"""
test_reportforge_server_route_sql_commands_no_forbidden_imports.py

Contract: reportforge_server_route_sql_commands.py (stdlib dev-server
wiring, Fase 8 scope extension) never imports sql_executor,
sql_schema_inspector, stored_procedure_catalog, Field Explorer, Preview,
the document serializer, or any exporter.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

MODULE_PATH = ROOT / "reportforge_server_route_sql_commands.py"

_FORBIDDEN_TOKENS = [
    "sql_executor", "sql_schema_inspector", "stored_procedure_catalog",
    "FieldExplorer", "PreviewEngine", "CommandRuntimeFile",
    "db_source_registry", "export/", "docx_export", "xlsx_export",
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
