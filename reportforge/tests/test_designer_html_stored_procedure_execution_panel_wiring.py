"""
test_designer_html_stored_procedure_execution_panel_wiring.py

Contract: designer/crystal-reports-designer-v4.html's F19C wiring is
minimal — the <script> tag loading StoredProcedureExecutionPanel.js, and
a plain <button id="btn-stored-procedure-execute"> with NO inline
onclick/logic (the click listener lives entirely in
StoredProcedureExecutionPanel.js's own DOMContentLoaded wiring). Mirrors
test_designer_html_sql_command_execution_panel_wiring.py for the sibling
panel.
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

HTML_PATH = ROOT / "designer" / "crystal-reports-designer-v4.html"


class TestDesignerHtmlStoredProcedureExecutionPanelWiring(unittest.TestCase):

    def test_script_tag_present(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        self.assertIn('<script src="/engines/StoredProcedureExecutionPanel.js"></script>', html)

    def test_button_present_with_expected_id(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        self.assertIn('id="btn-stored-procedure-execute"', html)

    def test_button_has_no_inline_onclick(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        match = re.search(r'<button[^>]*id="btn-stored-procedure-execute"[^>]*>', html)
        self.assertIsNotNone(match, "button tag not found")
        self.assertNotIn("onclick", match.group(0))

    def test_button_is_distinct_from_sql_command_execute_button(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        self.assertIn('id="btn-sql-command-execute"', html)
        self.assertIn('id="btn-stored-procedure-execute"', html)
        self.assertNotEqual(
            html.find('id="btn-sql-command-execute"'),
            html.find('id="btn-stored-procedure-execute"'),
        )


if __name__ == "__main__":
    unittest.main()
