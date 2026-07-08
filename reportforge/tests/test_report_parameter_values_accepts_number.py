"""
test_report_parameter_values_accepts_number.py

Contract: a "number" parameter accepts int/float directly, and numeric
strings normalized to int or float; booleans and non-numeric strings are
rejected.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.report_parameter_model import ReportParameterModel
from reportforge.core.render.datasource.report_parameter_values import validate_parameter_values


class TestReportParameterValuesAcceptsNumber(unittest.TestCase):

    def test_integer_value_is_accepted(self):
        params = [ReportParameterModel(name="Cantidad", label="Cantidad", type="number")]
        result = validate_parameter_values(params, {"Cantidad": 10})
        self.assertTrue(result.valid)
        self.assertEqual(result.normalized_values["Cantidad"], 10)

    def test_numeric_string_is_normalized(self):
        params = [ReportParameterModel(name="Cantidad", label="Cantidad", type="number")]
        result = validate_parameter_values(params, {"Cantidad": "42"})
        self.assertTrue(result.valid)
        self.assertEqual(result.normalized_values["Cantidad"], 42)

    def test_float_string_is_normalized(self):
        params = [ReportParameterModel(name="Total", label="Total", type="number")]
        result = validate_parameter_values(params, {"Total": "3.5"})
        self.assertTrue(result.valid)
        self.assertEqual(result.normalized_values["Total"], 3.5)

    def test_non_numeric_string_is_rejected(self):
        params = [ReportParameterModel(name="Cantidad", label="Cantidad", type="number")]
        result = validate_parameter_values(params, {"Cantidad": "abc"})
        self.assertFalse(result.valid)
        self.assertIn("Cantidad", result.errors)

    def test_boolean_is_rejected_as_number(self):
        params = [ReportParameterModel(name="Cantidad", label="Cantidad", type="number")]
        result = validate_parameter_values(params, {"Cantidad": True})
        self.assertFalse(result.valid)


if __name__ == "__main__":
    unittest.main()
