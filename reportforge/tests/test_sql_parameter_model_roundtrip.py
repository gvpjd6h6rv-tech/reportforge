"""
test_sql_parameter_model_roundtrip.py

Contract: SqlParameterModel.to_dict() / .from_dict() are exact inverses,
and defaults apply when optional fields are absent from the input dict.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_model import SqlParameterModel


class TestSqlParameterModelRoundtrip(unittest.TestCase):

    def test_roundtrip_preserves_all_fields(self):
        original = SqlParameterModel(name="FechaDesde", type="date", default="2026-01-01", required=True, source="crystal_param")
        restored = SqlParameterModel.from_dict(original.to_dict())
        self.assertEqual(restored, original)

    def test_from_dict_applies_defaults_for_missing_optional_fields(self):
        restored = SqlParameterModel.from_dict({"name": "CardCode"})
        self.assertEqual(restored.type, "string")
        self.assertIsNone(restored.default)
        self.assertEqual(restored.required, False)
        self.assertEqual(restored.source, "sql_param")

    def test_required_flag_coerces_truthy_input(self):
        restored = SqlParameterModel.from_dict({"name": "x", "required": 1})
        self.assertIs(restored.required, True)

    def test_default_value_of_none_roundtrips_as_none(self):
        original = SqlParameterModel(name="x", default=None)
        restored = SqlParameterModel.from_dict(original.to_dict())
        self.assertIsNone(restored.default)


if __name__ == "__main__":
    unittest.main()
