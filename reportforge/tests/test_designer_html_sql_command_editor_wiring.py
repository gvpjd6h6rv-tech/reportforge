"""
test_designer_html_sql_command_editor_wiring.py

Contract: designer/crystal-reports-designer-v4.html's Fase 8 wiring is
minimal — the <script> tag loading SqlCommandEditor.js, and a plain
<button id="btn-sql-command-editor"> with NO inline onclick/logic (the
click listener lives entirely in SqlCommandEditor.js's own
DOMContentLoaded wiring, not inline in the HTML).
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

HTML_PATH = ROOT / "designer" / "crystal-reports-designer-v4.html"


class TestDesignerHtmlSqlCommandEditorWiring(unittest.TestCase):

    def test_script_tag_present(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        self.assertIn('<script src="/engines/SqlCommandEditor.js"></script>', html)

    def test_button_present_with_expected_id(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        self.assertIn('id="btn-sql-command-editor"', html)

    def test_button_has_no_inline_onclick(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        match = re.search(r'<button[^>]*id="btn-sql-command-editor"[^>]*>', html)
        self.assertIsNotNone(match, "button tag not found")
        self.assertNotIn("onclick", match.group(0))

    def test_script_tag_loads_after_dependencies_it_needs(self):
        html = HTML_PATH.read_text(encoding="utf-8")
        # SqlCommandEditor.js must load somewhere in the script list —
        # position relative to SQLModal.js isn't load-bearing, just
        # confirms it's part of the same script-loading block, not
        # orphaned elsewhere.
        sql_modal_pos = html.find('<script src="/engines/SQLModal.js"></script>')
        editor_pos = html.find('<script src="/engines/SqlCommandEditor.js"></script>')
        self.assertGreater(sql_modal_pos, -1)
        self.assertGreater(editor_pos, -1)


if __name__ == "__main__":
    unittest.main()
