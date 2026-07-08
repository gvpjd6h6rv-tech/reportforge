"""
test_sql_executor_returns_normalized_result.py

Contract: execute_command() always returns a SqlExecutionResult instance
(never a bare list/dict), with columns derived from the actual result
rows and elapsed_ms populated as a real, non-negative measurement.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_executor import execute_command
from reportforge.core.render.datasource.sql_execution_result import SqlExecutionResult


class TestSqlExecutorReturnsNormalizedResult(unittest.TestCase):

    def test_return_type_is_sql_execution_result(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = execute_command(spec, "SELECT 1 AS x, 2 AS y")
        self.assertIsInstance(result, SqlExecutionResult)

    def test_columns_are_derived_from_result_rows(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = execute_command(spec, "SELECT 1 AS a, 2 AS b, 3 AS c")
        self.assertEqual(result.columns, ["a", "b", "c"])

    def test_columns_are_empty_when_no_rows_returned(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = execute_command(spec, "SELECT 1 AS x WHERE 0")
        self.assertEqual(result.rows, [])
        self.assertEqual(result.columns, [])

    def test_elapsed_ms_is_a_real_non_negative_measurement(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = execute_command(spec, "SELECT 1")
        self.assertIsInstance(result.elapsed_ms, float)
        self.assertGreaterEqual(result.elapsed_ms, 0)


if __name__ == "__main__":
    unittest.main()
