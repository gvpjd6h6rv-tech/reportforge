"""
test_sql_executor_allows_safe_select.py

Contract: execute_command() runs a plain SELECT through to completion and
returns a populated SqlExecutionResult.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_executor import execute_command


class TestSqlExecutorAllowsSafeSelect(unittest.TestCase):

    def test_safe_select_executes_and_returns_rows(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = execute_command(spec, "SELECT 1 AS x")
        self.assertEqual(result.rows, [{"x": 1}])
        self.assertEqual(result.columns, ["x"])
        self.assertEqual(result.row_count, 1)
        self.assertEqual(result.warnings, [])


if __name__ == "__main__":
    unittest.main()
