"""
test_sql_executor_does_not_interpolate_params.py

Contract: a parameter value that LOOKS like SQL (e.g. a quote-breaking
injection attempt) is bound as a literal value, never spliced into the
SQL string — proving execute_command() never builds SQL via string
formatting/concatenation with parameter values.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_executor import execute_command


class TestSqlExecutorDoesNotInterpolateParams(unittest.TestCase):

    def test_injection_shaped_value_is_bound_as_a_literal_not_spliced_in(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        malicious = "x'; DROP TABLE t; --"
        result = execute_command(spec, "SELECT :v AS v", {"v": malicious})
        # If this were string-interpolated, this would either raise a SQL
        # syntax error or execute multiple statements — instead the value
        # comes back untouched as plain data.
        self.assertEqual(result.rows, [{"v": malicious}])

    def test_prepared_sql_placeholder_is_unchanged_regardless_of_value(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result1 = execute_command(spec, "SELECT :v AS v", {"v": "safe"})
        result2 = execute_command(spec, "SELECT :v AS v", {"v": "'; --"})
        self.assertEqual(result1.rows, [{"v": "safe"}])
        self.assertEqual(result2.rows, [{"v": "'; --"}])


if __name__ == "__main__":
    unittest.main()
