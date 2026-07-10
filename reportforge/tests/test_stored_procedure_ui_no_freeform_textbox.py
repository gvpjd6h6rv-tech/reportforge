"""
test_stored_procedure_ui_no_freeform_textbox.py

Contract (F19C security grep): StoredProcedureExecutionPanel.js has no
free-text input for a procedure NAME — the only <input> elements it
creates are param-value inputs generated FROM the selected procedure's
declared params schema (dataset.paramName), and selection always happens
by clicking a row for an already-listed procedure, never by typing an
identifier.
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

_PANEL = ROOT / "engines" / "StoredProcedureExecutionPanel.js"


class TestStoredProcedureUiNoFreeformTextbox(unittest.TestCase):

    def test_only_input_creation_site_is_the_generated_param_form(self):
        source = _PANEL.read_text(encoding="utf-8")
        # Every "createElement('input')" in this file must be inside
        # _renderParamsForm, built from the (proc.params || []).forEach
        # loop — never a bare, standalone free-text field for a
        # procedure identifier.
        input_creations = [m.start() for m in re.finditer(r"createElement\('input'\)", source)]
        self.assertGreater(len(input_creations), 0, "expected at least the param inputs to exist")
        form_start = source.index("_renderParamsForm() {")
        form_end = source.index("_renderResultArea() {")
        for pos in input_creations:
            self.assertTrue(form_start < pos < form_end, "input created outside the generated params form")

    def test_param_inputs_are_bound_to_a_declared_param_name_not_free_text(self):
        source = _PANEL.read_text(encoding="utf-8")
        self.assertIn("input.dataset.paramName = p.name", source)

    def test_execution_never_reads_a_procedure_name_field_from_the_dom(self):
        source = _PANEL.read_text(encoding="utf-8")
        self.assertNotIn("procedure-name", source.lower().replace("_", "-"))
        self.assertNotIn("getElementById('spep-procedure-name')", source)

    def test_selection_is_always_by_clicking_an_already_listed_procedure(self):
        source = _PANEL.read_text(encoding="utf-8")
        self.assertIn("_selectProcedure(proc)", source)
        # the selector takes the already-fetched proc object, never a
        # user-typed string
        self.assertIn("selectBtn.onclick = () => this._selectProcedure(proc);", source)


if __name__ == "__main__":
    unittest.main()
