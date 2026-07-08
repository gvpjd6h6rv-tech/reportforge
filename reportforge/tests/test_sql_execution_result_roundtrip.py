"""
test_sql_execution_result_roundtrip.py

Contract: SqlExecutionResult.to_dict() / .from_dict() are exact inverses.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_execution_result import SqlExecutionResult


class TestSqlExecutionResultRoundtrip(unittest.TestCase):

    def test_roundtrip_preserves_all_fields(self):
        original = SqlExecutionResult(
            rows=[{"a": 1}, {"a": 2}],
            columns=["a"],
            elapsed_ms=12.5,
            row_count=2,
            warnings=["Result truncated to 2 rows (query returned 5)."],
        )
        restored = SqlExecutionResult.from_dict(original.to_dict())
        self.assertEqual(restored, original)

    def test_from_dict_applies_defaults_for_missing_fields(self):
        restored = SqlExecutionResult.from_dict({})
        self.assertEqual(restored.rows, [])
        self.assertEqual(restored.columns, [])
        self.assertEqual(restored.elapsed_ms, 0.0)
        self.assertEqual(restored.row_count, 0)
        self.assertEqual(restored.warnings, [])


if __name__ == "__main__":
    unittest.main()
