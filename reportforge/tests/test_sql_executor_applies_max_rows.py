"""
test_sql_executor_applies_max_rows.py

Contract: execute_command() truncates the result to the resolved max_rows
and records a warning when truncation actually happened; row_count
reflects the TRUNCATED count, not the driver's raw count.
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

from reportforge.core.render.datasource.sql_executor import execute_command


class TestSqlExecutorAppliesMaxRows(unittest.TestCase):

    def setUp(self):
        self.db_path = tempfile.mktemp(suffix=".db")
        conn = sqlite3.connect(self.db_path)
        conn.execute("CREATE TABLE t (n INT)")
        conn.executemany("INSERT INTO t VALUES (?)", [(i,) for i in range(10)])
        conn.commit()
        conn.close()

    def tearDown(self):
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_max_rows_truncates_and_warns(self):
        spec = {"type": "sqlite", "path": self.db_path}
        result = execute_command(spec, "SELECT n FROM t", max_rows=3)
        self.assertEqual(result.row_count, 3)
        self.assertEqual(len(result.rows), 3)
        self.assertEqual(len(result.warnings), 1)
        self.assertIn("truncated", result.warnings[0].lower())

    def test_no_truncation_when_under_max_rows(self):
        spec = {"type": "sqlite", "path": self.db_path}
        result = execute_command(spec, "SELECT n FROM t", max_rows=100)
        self.assertEqual(result.row_count, 10)
        self.assertEqual(result.warnings, [])


if __name__ == "__main__":
    unittest.main()
