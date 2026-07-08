"""
test_report_parameter_values_accepts_string.py

Contract: a "string" parameter accepts any non-None value, normalized via
str().
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.report_parameter_model import ReportParameterModel
from reportforge.core.render.datasource.report_parameter_values import validate_parameter_values


class TestReportParameterValuesAcceptsString(unittest.TestCase):

    def test_string_value_is_accepted(self):
        params = [ReportParameterModel(name="CardCode", label="Cliente", type="string")]
        result = validate_parameter_values(params, {"CardCode": "C0001"})
        self.assertTrue(result.valid)
        self.assertEqual(result.normalized_values["CardCode"], "C0001")

    def test_non_string_value_is_normalized_to_string(self):
        params = [ReportParameterModel(name="CardCode", label="Cliente", type="string")]
        result = validate_parameter_values(params, {"CardCode": 12345})
        self.assertTrue(result.valid)
        self.assertEqual(result.normalized_values["CardCode"], "12345")


if __name__ == "__main__":
    unittest.main()
