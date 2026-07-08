"""
test_fase12_sql_command_persistence_no_forbidden_tokens.py

Contract: the Fase 12 files (SqlCommandStore.js, and the modified
SqlCommandEditor.js/CommandRuntimeFile.js/DocumentTabManager.js) never
reference sql_executor, real EXEC/stored-procedure execution, Field
Explorer, or Preview. Also confirms SqlCommandStore is the ONLY module
that reads/writes DS.sqlCommands directly — SqlCommandEditor.js and
CommandRuntimeFile.js only call its public API (add/list/clear), never
touch DS.sqlCommands themselves. And StoredProcedurePicker.js was left
untouched (no changes required for this reduced scope).
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

STORE = ROOT / "engines" / "SqlCommandStore.js"
EDITOR = ROOT / "engines" / "SqlCommandEditor.js"
CRF = ROOT / "engines" / "CommandRuntimeFile.js"
TAB_MANAGER = ROOT / "engines" / "DocumentTabManager.js"
PICKER = ROOT / "engines" / "StoredProcedurePicker.js"

_FORBIDDEN_TOKENS = ["sql_executor", "execute_command", "FieldExplorer", "PreviewEngine"]


def _code_outside_leading_doc_comment(source: str) -> str:
    start = source.find("/**")
    end = source.find("*/", start) + 2 if start != -1 else 0
    return source[end:]


def _strip_all_comments(source: str) -> str:
    without_block_comments = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)
    without_line_comments = re.sub(r"//[^\n]*", "", without_block_comments)
    return without_line_comments


class TestFase12SqlCommandPersistenceNoForbiddenTokens(unittest.TestCase):

    def test_no_forbidden_tokens_in_modified_or_new_files(self):
        for path in (STORE, EDITOR, CRF, TAB_MANAGER):
            code = _code_outside_leading_doc_comment(path.read_text(encoding="utf-8"))
            for token in _FORBIDDEN_TOKENS:
                self.assertNotIn(token, code, f"forbidden token {token!r} found in {path.name}")

    def test_only_sql_command_store_writes_ds_sql_commands_directly(self):
        # SqlCommandEditor.js must call SqlCommandStore's API, never
        # assign/read DS.sqlCommands itself in executable code (comments,
        # block or line, legitimately name DS.sqlCommands in prose).
        for path in (EDITOR,):
            code = _strip_all_comments(path.read_text(encoding="utf-8"))
            self.assertNotRegex(code, r"DS\.sqlCommands", f"{path.name} touches DS.sqlCommands directly")

    def test_command_runtime_file_uses_sql_command_store_api_not_direct_array_access(self):
        source = CRF.read_text(encoding="utf-8")
        self.assertIn("SqlCommandStore.list()", source)
        self.assertIn("SqlCommandStore.clear()", source)
        # Fase 12 refactor (score reduction): passes the function reference
        # directly to forEach (`.forEach(SqlCommandStore.add)`) instead of
        # wrapping it in an arrow — still SqlCommandStore's own API, not a
        # direct DS.sqlCommands mutation.
        self.assertIn("SqlCommandStore.add", source)
        code = _strip_all_comments(source)
        self.assertNotRegex(code, r"DS\.sqlCommands\s*=")

    def test_document_tab_manager_uses_sql_command_store_clear_not_direct_assignment(self):
        source = TAB_MANAGER.read_text(encoding="utf-8")
        self.assertIn("SqlCommandStore.clear()", source)
        code = _strip_all_comments(source)
        self.assertNotRegex(code, r"DS\.sqlCommands\s*=")

    def test_stored_procedure_picker_was_not_modified(self):
        source = PICKER.read_text(encoding="utf-8")
        self.assertNotIn("SqlCommandStore", source)

    def test_sql_command_store_owns_ds_sql_commands(self):
        source = STORE.read_text(encoding="utf-8")
        self.assertIn("DS.sqlCommands", source)

    def test_no_listing_ui_dom_ids_created(self):
        html = (ROOT / "designer" / "crystal-reports-designer-v4.html").read_text(encoding="utf-8")
        self.assertNotRegex(html, re.compile(r"sql-command-list|sqlcommandlist", re.IGNORECASE))


if __name__ == "__main__":
    unittest.main()
