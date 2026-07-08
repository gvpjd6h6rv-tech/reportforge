"""
test_fase13_sql_commands_list_panel_no_forbidden_tokens.py

Contract: Fase 13 (SqlCommandsListPanel.js, SqlCommandStore.remove())
never references sql_executor, Preview, Field Explorer, or backend
routes. Confirms SqlCommandEditor.js, CommandRuntimeFile.js, and
DocumentTabManager.js were NOT modified by this phase (audit found no
real need to touch them), and that no update()/edit-mode logic exists
anywhere in the new/modified files.
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

PANEL = ROOT / "engines" / "SqlCommandsListPanel.js"
STORE = ROOT / "engines" / "SqlCommandStore.js"
EDITOR = ROOT / "engines" / "SqlCommandEditor.js"
CRF = ROOT / "engines" / "CommandRuntimeFile.js"
TAB_MANAGER = ROOT / "engines" / "DocumentTabManager.js"

_FORBIDDEN_TOKENS = ["sql_executor", "execute_command", "FieldExplorer", "PreviewEngine", "api_routes"]


def _code_outside_leading_doc_comment(source: str) -> str:
    start = source.find("/**")
    end = source.find("*/", start) + 2 if start != -1 else 0
    return source[end:]


class TestFase13SqlCommandsListPanelNoForbiddenTokens(unittest.TestCase):

    def test_no_forbidden_tokens_in_new_or_modified_files(self):
        for path in (PANEL, STORE):
            code = _code_outside_leading_doc_comment(path.read_text(encoding="utf-8"))
            for token in _FORBIDDEN_TOKENS:
                self.assertNotIn(token, code, f"forbidden token {token!r} found in {path.name}")

    def test_sql_command_editor_untouched_by_fase13(self):
        source = EDITOR.read_text(encoding="utf-8")
        self.assertNotIn("SqlCommandsListPanel", source)
        self.assertNotIn("Fase 13", source)

    def test_command_runtime_file_untouched_by_fase13(self):
        source = CRF.read_text(encoding="utf-8")
        self.assertNotIn("SqlCommandsListPanel", source)
        self.assertNotIn("Fase 13", source)

    def test_document_tab_manager_untouched_by_fase13(self):
        source = TAB_MANAGER.read_text(encoding="utf-8")
        self.assertNotIn("SqlCommandsListPanel", source)
        self.assertNotIn("Fase 13", source)

    def test_no_update_or_edit_mode_logic_anywhere(self):
        for path in (PANEL, STORE):
            code = _code_outside_leading_doc_comment(path.read_text(encoding="utf-8"))
            self.assertNotRegex(code, r"\bupdate\s*\(")
            self.assertNotIn("editMode", code)
            self.assertNotIn("SqlCommandEditor.open", code)

    def test_store_has_remove_but_not_update(self):
        source = STORE.read_text(encoding="utf-8")
        self.assertIn("remove(id)", source)
        code = _code_outside_leading_doc_comment(source)
        self.assertNotRegex(code, r"\bupdate\s*\(")

    def test_button_and_script_tag_present(self):
        html = (ROOT / "designer" / "crystal-reports-designer-v4.html").read_text(encoding="utf-8")
        self.assertIn('id="btn-sql-commands-list"', html)
        self.assertIn('<script src="/engines/SqlCommandsListPanel.js"></script>', html)

    def test_button_has_no_inline_onclick(self):
        html = (ROOT / "designer" / "crystal-reports-designer-v4.html").read_text(encoding="utf-8")
        match = re.search(r'<button[^>]*id="btn-sql-commands-list"[^>]*>', html)
        self.assertIsNotNone(match)
        self.assertNotIn("onclick", match.group(0))


if __name__ == "__main__":
    unittest.main()
