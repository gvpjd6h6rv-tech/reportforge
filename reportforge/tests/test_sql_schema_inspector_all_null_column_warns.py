"""
test_sql_schema_inspector_all_null_column_warns.py

Contract: a column whose every sampled value is NULL is reported as
unknown/string with an explicit per-column warning — never a guessed
type, and other columns in the same result are still inferred normally.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_schema_inspector import inspect_schema


class TestSqlSchemaInspectorAllNullColumnWarns(unittest.TestCase):

    def setUp(self):
        self.db_path = tempfile.mktemp(suffix=".db")
        conn = sqlite3.connect(self.db_path)
        conn.execute("CREATE TABLE t (a INT, b INT)")
        conn.execute("INSERT INTO t VALUES (1, NULL)")
        conn.commit()
        conn.close()

    def tearDown(self):
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_all_null_column_reports_unknown_string_with_warning(self):
        spec = {"type": "sqlite", "path": self.db_path}
        result = inspect_schema(spec, "SELECT a, b FROM t")
        by_name = {c.name: c for c in result.columns}
        self.assertEqual(by_name["b"].db_type, "unknown")
        self.assertEqual(by_name["b"].rf_type, "string")
        self.assertTrue(by_name["b"].nullable)
        self.assertTrue(any("'b'" in w for w in result.warnings))

    def test_other_columns_still_inferred_normally(self):
        spec = {"type": "sqlite", "path": self.db_path}
        result = inspect_schema(spec, "SELECT a, b FROM t")
        by_name = {c.name: c for c in result.columns}
        self.assertEqual(by_name["a"].rf_type, "number")


if __name__ == "__main__":
    unittest.main()
