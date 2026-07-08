"""
test_fase11_stored_procedure_picker_no_forbidden_tokens.py

Contract: none of the Fase 11 files (StoredProcedurePicker.js, both
api_routes_datasources.py's new routes, and
reportforge_server_datasources.py's new functions) import/reference
sql_executor directly, add_to_allowlist, FieldExplorer, the document
serializer/CommandRuntimeFile, or Preview — and the JS picker only calls
SqlCommandEditor's public API (never reaches into its internals).

NOTE: the picker DOES now pass a third argument (the datasource alias)
to SqlCommandEditor.open() as of Fase 17A — see
test_picker_js_only_calls_sql_command_editor_public_open_method below,
which already only asserts the call goes through open(), not its arity.
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

JS_PICKER = ROOT / "engines" / "StoredProcedurePicker.js"
SQL_COMMAND_EDITOR = ROOT / "engines" / "SqlCommandEditor.js"

_FORBIDDEN_BACKEND_TOKENS = ["sql_executor", "add_to_allowlist", "FieldExplorer", "CommandRuntimeFile"]
_FORBIDDEN_JS_TOKENS = ["FieldExplorer", "CommandRuntimeFile", "sql_executor", "PreviewEngine"]


class TestFase11StoredProcedurePickerNoForbiddenTokens(unittest.TestCase):

    def test_fastapi_routes_no_forbidden_tokens_in_new_procedure_routes(self):
        source = (ROOT / "reportforge" / "server" / "api_routes_datasources.py").read_text(encoding="utf-8")
        start = source.find("_get_ds_procedures")
        procedures_section = source[start:]
        for token in _FORBIDDEN_BACKEND_TOKENS:
            self.assertNotIn(token, procedures_section, f"forbidden token {token!r} in api_routes_datasources.py procedures section")

    def test_stdlib_routes_no_forbidden_tokens_in_new_procedure_functions(self):
        source = (ROOT / "reportforge_server_datasources.py").read_text(encoding="utf-8")
        start = source.find("_get_ds_procedures")
        procedures_section = source[start:]
        for token in _FORBIDDEN_BACKEND_TOKENS:
            self.assertNotIn(token, procedures_section, f"forbidden token {token!r} in reportforge_server_datasources.py procedures section")

    def test_picker_js_no_forbidden_tokens_outside_doc_comment(self):
        source = JS_PICKER.read_text(encoding="utf-8")
        start = source.find("/**")
        end = source.find("*/", start) + 2 if start != -1 else 0
        code_only = source[end:]
        for token in _FORBIDDEN_JS_TOKENS:
            self.assertNotIn(token, code_only, f"forbidden token {token!r} found in StoredProcedurePicker.js")

    def test_picker_js_only_calls_sql_command_editor_public_open_method(self):
        source = JS_PICKER.read_text(encoding="utf-8")
        self.assertIn("SqlCommandEditor.open(", source)
        # Never reaches into SqlCommandEditor's internals (_-prefixed members).
        self.assertNotRegex(source, r"SqlCommandEditor\._\w+")

    def test_sql_command_editor_js_was_not_modified_by_fase11(self):
        # Static guard: SqlCommandEditor.js's own doc comment still says
        # Fase 8 — proves Fase 11 only ever called its public API, never
        # edited the file.
        #
        # NOTE: Fase 17A (BLOCK-F17-1 resolution) DID legitimately modify
        # this file — open() gained a third argument (existingAlias) so a
        # command built via the picker can carry its datasource_alias, and
        # its doc comment names "StoredProcedurePicker" to explain where
        # that alias comes from. The original "never mentions
        # StoredProcedurePicker" assertion no longer holds — that's Fase
        # 17A's own authorized change, not a Fase-11-era regression. See
        # test_sql_command_editor_datasource_alias.test.mjs for that
        # contract's actual tests.
        source = SQL_COMMAND_EDITOR.read_text(encoding="utf-8")
        self.assertIn("Fase 8", source)

    def test_no_real_exec_execution_string_in_picker(self):
        source = JS_PICKER.read_text(encoding="utf-8")
        # The picker must never construct a request to any execution
        # endpoint — only to /procedures, /parameters, /build-command.
        fetch_calls = re.findall(r"fetch\(`?([^`'\"]+)", source)
        for url in fetch_calls:
            self.assertNotIn("/query", url)
            self.assertNotIn("/execute", url)


if __name__ == "__main__":
    unittest.main()
