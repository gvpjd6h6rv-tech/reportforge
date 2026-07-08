"""
test_result_schema_model_roundtrip.py

Contract: ResultColumnModel.to_dict() / .from_dict() are exact inverses,
and defaults apply when optional fields are absent from the input dict.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.result_schema_model import ResultColumnModel


class TestResultSchemaModelRoundtrip(unittest.TestCase):

    def test_roundtrip_preserves_all_fields(self):
        original = ResultColumnModel(name="CardCode", db_type="nvarchar", rf_type="string", nullable=False, ordinal=2)
        restored = ResultColumnModel.from_dict(original.to_dict())
        self.assertEqual(restored, original)

    def test_from_dict_applies_defaults_for_missing_optional_fields(self):
        restored = ResultColumnModel.from_dict({"name": "DocTotal", "db_type": "money", "rf_type": "number"})
        self.assertEqual(restored.nullable, True)
        self.assertEqual(restored.ordinal, 0)

    def test_a_command_result_schema_is_a_plain_list_of_these(self):
        columns = [
            ResultColumnModel(name="DocNum", db_type="int", rf_type="number", nullable=False, ordinal=0),
            ResultColumnModel(name="CardName", db_type="nvarchar", rf_type="string", nullable=True, ordinal=1),
        ]
        as_list = [c.to_dict() for c in columns]
        restored = [ResultColumnModel.from_dict(d) for d in as_list]
        self.assertEqual(restored, columns)


if __name__ == "__main__":
    unittest.main()
