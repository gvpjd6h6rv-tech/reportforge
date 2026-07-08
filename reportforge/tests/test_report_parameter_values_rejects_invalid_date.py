"""
test_report_parameter_values_rejects_invalid_date.py

Contract: a malformed date string for a "date" parameter is rejected with
a clear, per-parameter error — never raises, never silently accepts.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.report_parameter_model import ReportParameterModel
from reportforge.core.render.datasource.report_parameter_values import validate_parameter_values


class TestReportParameterValuesRejectsInvalidDate(unittest.TestCase):

    def test_malformed_date_string_is_rejected(self):
        params = [ReportParameterModel(name="FechaDesde", label="Fecha Desde", type="date")]
        result = validate_parameter_values(params, {"FechaDesde": "31/01/2026"})
        self.assertFalse(result.valid)
        self.assertIn("FechaDesde", result.errors)
        self.assertNotIn("FechaDesde", result.normalized_values)

    def test_non_string_non_date_value_is_rejected(self):
        params = [ReportParameterModel(name="FechaDesde", label="Fecha Desde", type="date")]
        result = validate_parameter_values(params, {"FechaDesde": 12345})
        self.assertFalse(result.valid)
        self.assertIn("FechaDesde", result.errors)


if __name__ == "__main__":
    unittest.main()
