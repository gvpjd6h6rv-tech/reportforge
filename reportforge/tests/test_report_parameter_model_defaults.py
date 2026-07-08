"""
test_report_parameter_model_defaults.py

Contract: ReportParameterModel.from_dict() applies sane defaults when
optional fields are absent — type="string", required=False,
default_value=None, source="manual", and label falls back to name.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.report_parameter_model import ReportParameterModel


class TestReportParameterModelDefaults(unittest.TestCase):

    def test_defaults_apply_for_missing_optional_fields(self):
        restored = ReportParameterModel.from_dict({"name": "CardCode"})
        self.assertEqual(restored.label, "CardCode")
        self.assertEqual(restored.type, "string")
        self.assertEqual(restored.required, False)
        self.assertIsNone(restored.default_value)
        self.assertEqual(restored.source, "manual")


if __name__ == "__main__":
    unittest.main()
