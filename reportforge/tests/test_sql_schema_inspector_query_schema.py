"""
test_sql_schema_inspector_query_schema.py

Contract: inspect_schema() on a plain SELECT with real, non-null sample
data infers a ResultColumnModel per column, with rf_type derived from the
Python runtime value type, and no warnings when inference succeeded
cleanly.
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


class TestSqlSchemaInspectorQuerySchema(unittest.TestCase):

    def setUp(self):
        self.db_path = tempfile.mktemp(suffix=".db")
        conn = sqlite3.connect(self.db_path)
        conn.execute("CREATE TABLE t (n INT, name TEXT, amt REAL)")
        conn.execute("INSERT INTO t VALUES (1, 'a', 1.5)")
        conn.execute("INSERT INTO t VALUES (2, 'b', 2.5)")
        conn.commit()
        conn.close()

    def tearDown(self):
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_infers_columns_with_correct_rf_type(self):
        spec = {"type": "sqlite", "path": self.db_path}
        result = inspect_schema(spec, "SELECT n, name, amt FROM t")
        by_name = {c.name: c for c in result.columns}
        self.assertEqual(by_name["n"].rf_type, "number")
        self.assertEqual(by_name["name"].rf_type, "string")
        self.assertEqual(by_name["amt"].rf_type, "number")
        self.assertEqual(result.warnings, [])

    def test_ordinal_matches_column_position(self):
        spec = {"type": "sqlite", "path": self.db_path}
        result = inspect_schema(spec, "SELECT n, name, amt FROM t")
        ordinals = {c.name: c.ordinal for c in result.columns}
        self.assertEqual(ordinals, {"n": 0, "name": 1, "amt": 2})


if __name__ == "__main__":
    unittest.main()
