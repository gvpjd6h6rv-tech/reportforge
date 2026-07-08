"""
test_report_parameter_values_accepts_boolean.py

Contract: a "boolean" parameter accepts real bools and the strings
"true"/"false" (case-insensitive), normalized to a real bool; anything
else is rejected.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.report_parameter_model import ReportParameterModel
from reportforge.core.render.datasource.report_parameter_values import validate_parameter_values


class TestReportParameterValuesAcceptsBoolean(unittest.TestCase):

    def test_real_boolean_is_accepted(self):
        params = [ReportParameterModel(name="SoloVencidas", label="Solo vencidas", type="boolean")]
        result = validate_parameter_values(params, {"SoloVencidas": True})
        self.assertTrue(result.valid)
        self.assertIs(result.normalized_values["SoloVencidas"], True)

    def test_string_true_false_is_normalized_case_insensitively(self):
        params = [ReportParameterModel(name="SoloVencidas", label="Solo vencidas", type="boolean")]
        result = validate_parameter_values(params, {"SoloVencidas": "TRUE"})
        self.assertTrue(result.valid)
        self.assertIs(result.normalized_values["SoloVencidas"], True)

    def test_non_boolean_string_is_rejected(self):
        params = [ReportParameterModel(name="SoloVencidas", label="Solo vencidas", type="boolean")]
        result = validate_parameter_values(params, {"SoloVencidas": "yes"})
        self.assertFalse(result.valid)
        self.assertIn("SoloVencidas", result.errors)


if __name__ == "__main__":
    unittest.main()
