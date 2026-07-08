"""
test_report_parameter_model_roundtrip.py

Contract: ReportParameterModel.to_dict() / .from_dict() are exact
inverses.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.report_parameter_model import ReportParameterModel


class TestReportParameterModelRoundtrip(unittest.TestCase):

    def test_roundtrip_preserves_all_fields(self):
        original = ReportParameterModel(
            name="FechaDesde",
            label="Fecha Desde",
            type="date",
            required=True,
            default_value="2026-01-01",
            source="sql_command",
        )
        restored = ReportParameterModel.from_dict(original.to_dict())
        self.assertEqual(restored, original)


if __name__ == "__main__":
    unittest.main()
