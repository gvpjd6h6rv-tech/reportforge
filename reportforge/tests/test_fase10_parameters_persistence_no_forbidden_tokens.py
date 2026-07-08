"""
test_fase10_parameters_persistence_no_forbidden_tokens.py

Contract: the Fase 10 changes (engines/CommandRuntimeFile.js,
engines/DocumentTabManager.js) never reference sql_executor, SQL
commands/SqlCommandEditor, Field Explorer, Preview internals beyond the
existing DS.parameterValues contract, or SAP backend document routes.
Also confirms no new SQL command persistence field (layout.sqlCommands)
was introduced — that's explicitly out of scope (BL-F10-1/2/3).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

MODULES = [
    ROOT / "engines" / "CommandRuntimeFile.js",
    ROOT / "engines" / "DocumentTabManager.js",
]

_FORBIDDEN_TOKENS = [
    "sql_executor", "SqlCommandEditor", "sqlCommands", "FieldExplorer",
    "api_routes_document", "stored_procedure_catalog",
]


class TestFase10ParametersPersistenceNoForbiddenTokens(unittest.TestCase):

    def test_no_forbidden_token_in_modified_files(self):
        for path in MODULES:
            source = path.read_text(encoding="utf-8")
            for token in _FORBIDDEN_TOKENS:
                self.assertNotIn(token, source, f"forbidden token {token!r} found in {path.name}")

    def test_command_runtime_file_saves_parameters_and_parameter_values(self):
        source = (ROOT / "engines" / "CommandRuntimeFile.js").read_text(encoding="utf-8")
        self.assertIn("parameters:", source)
        self.assertIn("parameterValues:", source)

    def test_document_tab_manager_resets_parameter_state_on_new(self):
        source = (ROOT / "engines" / "DocumentTabManager.js").read_text(encoding="utf-8")
        self.assertIn("DS.parameterValues = {}", source)
        self.assertIn("DS.layout = { parameters: [] }", source)


if __name__ == "__main__":
    unittest.main()
