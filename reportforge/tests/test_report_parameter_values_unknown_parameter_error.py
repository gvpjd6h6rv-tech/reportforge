"""
test_report_parameter_values_unknown_parameter_error.py

Contract: a value supplied for a name that isn't in the report's declared
parameter list is reported as an error (protects against silently
accepting/ignoring a typo'd or stale parameter name).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.report_parameter_model import ReportParameterModel
from reportforge.core.render.datasource.report_parameter_values import validate_parameter_values


class TestReportParameterValuesUnknownParameterError(unittest.TestCase):

    def test_unknown_parameter_name_is_an_error(self):
        params = [ReportParameterModel(name="FechaDesde", label="Fecha Desde", type="date")]
        result = validate_parameter_values(params, {"FechaDesde": "2026-01-01", "NotDeclared": "x"})
        self.assertFalse(result.valid)
        self.assertIn("NotDeclared", result.errors)
        self.assertIn("Unknown parameter", result.errors["NotDeclared"])

    def test_known_parameter_alongside_unknown_still_normalizes_correctly(self):
        params = [ReportParameterModel(name="FechaDesde", label="Fecha Desde", type="date")]
        result = validate_parameter_values(params, {"FechaDesde": "2026-01-01", "NotDeclared": "x"})
        self.assertEqual(result.normalized_values["FechaDesde"], "2026-01-01")


if __name__ == "__main__":
    unittest.main()
