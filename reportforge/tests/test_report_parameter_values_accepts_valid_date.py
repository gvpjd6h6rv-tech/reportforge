"""
test_report_parameter_values_accepts_valid_date.py

Contract: a valid ISO date string (YYYY-MM-DD) for a "date" parameter
validates and normalizes cleanly.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.report_parameter_model import ReportParameterModel
from reportforge.core.render.datasource.report_parameter_values import validate_parameter_values


class TestReportParameterValuesAcceptsValidDate(unittest.TestCase):

    def test_valid_iso_date_is_accepted_and_normalized(self):
        params = [ReportParameterModel(name="FechaDesde", label="Fecha Desde", type="date", required=True)]
        result = validate_parameter_values(params, {"FechaDesde": "2026-01-01"})
        self.assertTrue(result.valid)
        self.assertEqual(result.errors, {})
        self.assertEqual(result.normalized_values["FechaDesde"], "2026-01-01")


if __name__ == "__main__":
    unittest.main()
