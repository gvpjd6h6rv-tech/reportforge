"""
test_fase9_parameters_panel_no_forbidden_tokens.py

Contract: the 3 new Fase 9 modules (LeftParametersPanel.js,
ParameterInputRenderer.js, ParameterValueController.js) never reference
sql_executor/execute_command, FieldExplorer, CommandRuntimeFile, or a
document serializer — outside their own "does NOT" doc comments. Also
confirms the tabs inferiores (Grupos/Parámetros/Buscar) markup wasn't
restructured — only the "active" CSS class moved to reflect the
Parámetros tab (cosmetic, no new switching logic), and #params-list is
still the container Fase 9 owns.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

MODULES = [
    ROOT / "engines" / "LeftParametersPanel.js",
    ROOT / "engines" / "ParameterInputRenderer.js",
    ROOT / "engines" / "ParameterValueController.js",
]

_FORBIDDEN_TOKENS = [
    "sql_executor", "execute_command", "FieldExplorer", "CommandRuntimeFile", "serializer",
]


def _code_outside_doc_comment(source: str) -> str:
    start = source.find("/**")
    end = source.find("*/", start) + 2 if start != -1 else 0
    return source[end:]


class TestFase9ParametersPanelNoForbiddenTokens(unittest.TestCase):

    def test_no_forbidden_token_outside_doc_comments(self):
        for path in MODULES:
            code = _code_outside_doc_comment(path.read_text(encoding="utf-8"))
            for token in _FORBIDDEN_TOKENS:
                self.assertNotIn(token, code, f"forbidden token {token!r} found in {path.name}")

    def test_tabs_inferiores_still_three_tabs_parametros_now_active(self):
        html = (ROOT / "designer" / "crystal-reports-designer-v4.html").read_text(encoding="utf-8")
        self.assertIn('<div class="panel-tab" id=ptab-groups>Grupos</div>', html)
        self.assertIn('<div class="panel-tab active" id=ptab-params>Parámetros</div>', html)
        self.assertIn('<div class="panel-tab" id=ptab-find>Buscar</div>', html)

    def test_params_list_container_still_present(self):
        html = (ROOT / "designer" / "crystal-reports-designer-v4.html").read_text(encoding="utf-8")
        self.assertIn('id=params-list', html)

    def test_new_script_tags_present_in_correct_order(self):
        html = (ROOT / "designer" / "crystal-reports-designer-v4.html").read_text(encoding="utf-8")
        controller_pos = html.find('<script src="/engines/ParameterValueController.js"></script>')
        renderer_pos = html.find('<script src="/engines/ParameterInputRenderer.js"></script>')
        panel_pos = html.find('<script src="/engines/LeftParametersPanel.js"></script>')
        self.assertGreater(controller_pos, -1)
        self.assertGreater(renderer_pos, -1)
        self.assertGreater(panel_pos, -1)
        self.assertLess(controller_pos, panel_pos)
        self.assertLess(renderer_pos, panel_pos)

    def test_field_explorer_markup_untouched(self):
        html = (ROOT / "designer" / "crystal-reports-designer-v4.html").read_text(encoding="utf-8")
        self.assertIn('id="field-tree"', html)


if __name__ == "__main__":
    unittest.main()
