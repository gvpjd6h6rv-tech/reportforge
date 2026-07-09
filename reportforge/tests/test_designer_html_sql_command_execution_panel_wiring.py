"""
test_designer_html_sql_command_execution_panel_wiring.py

Contract: designer/crystal-reports-designer-v4.html's F19B-1B wiring is
minimal — the <script> tag loading SqlCommandExecutionPanel.js, and a
plain <button id="btn-sql-command-execute"> with NO inline onclick/logic
(the click listener lives entirely in SqlCommandExecutionPanel.js's own
DOMContentLoaded wiring). Neither SqlCommandEditor.js nor
SqlCommandsListPanel.js needed to change for this wiring — both remain
byte-for-byte outside this file's diff (verified elsewhere via git diff,
not here).
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

HTML_PATH = ROOT / "designer" / "crystal-reports-designer-v4.html"


class TestDesignerHtmlSqlCommandExecutionPanelWiring(unittest.TestCase):

    def test_script_tag_present(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        self.assertIn('<script src="/engines/SqlCommandExecutionPanel.js"></script>', html)

    def test_button_present_with_expected_id(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        self.assertIn('id="btn-sql-command-execute"', html)

    def test_button_has_no_inline_onclick(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        match = re.search(r'<button[^>]*id="btn-sql-command-execute"[^>]*>', html)
        self.assertIsNotNone(match, "button tag not found")
        self.assertNotIn("onclick", match.group(0))

    def test_script_tag_loads_alongside_the_other_sql_command_scripts(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        list_panel_pos = html.find('<script src="/engines/SqlCommandsListPanel.js"></script>')
        exec_panel_pos = html.find('<script src="/engines/SqlCommandExecutionPanel.js"></script>')
        self.assertGreater(list_panel_pos, -1)
        self.assertGreater(exec_panel_pos, -1)


if __name__ == "__main__":
    unittest.main()
