"""
test_sql_schema_inspector_no_rows.py

Contract: inspect_schema() on a query returning zero rows never crashes,
and reports an honest warning rather than fabricating types.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_schema_inspector import inspect_schema


class TestSqlSchemaInspectorNoRows(unittest.TestCase):

    def test_no_rows_does_not_crash_and_warns(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = inspect_schema(spec, "SELECT 1 AS x WHERE 0")
        self.assertEqual(result.columns, [])
        self.assertEqual(len(result.warnings), 1)
        self.assertIn("no rows", result.warnings[0].lower())


if __name__ == "__main__":
    unittest.main()
