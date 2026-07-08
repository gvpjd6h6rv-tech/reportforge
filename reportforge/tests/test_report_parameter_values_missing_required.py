"""
test_report_parameter_values_missing_required.py

Contract: a required parameter with no value and no default is reported
as missing; a required parameter with a default is NOT flagged missing
when omitted from the values dict.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.report_parameter_model import ReportParameterModel
from reportforge.core.render.datasource.report_parameter_values import validate_parameter_values


class TestReportParameterValuesMissingRequired(unittest.TestCase):

    def test_missing_required_parameter_with_no_default_is_an_error(self):
        params = [ReportParameterModel(name="FechaDesde", label="Fecha Desde", type="date", required=True)]
        result = validate_parameter_values(params, {})
        self.assertFalse(result.valid)
        self.assertIn("FechaDesde", result.errors)
        self.assertIn("Missing required parameter", result.errors["FechaDesde"])

    def test_missing_optional_parameter_is_not_an_error(self):
        params = [ReportParameterModel(name="CardCode", label="Cliente", type="string", required=False)]
        result = validate_parameter_values(params, {})
        self.assertTrue(result.valid)
        self.assertEqual(result.errors, {})

    def test_required_parameter_falls_back_to_default_value_when_omitted(self):
        params = [ReportParameterModel(name="FechaDesde", label="Fecha Desde", type="date", required=True, default_value="2026-01-01")]
        result = validate_parameter_values(params, {})
        self.assertTrue(result.valid)
        self.assertEqual(result.normalized_values["FechaDesde"], "2026-01-01")


if __name__ == "__main__":
    unittest.main()
