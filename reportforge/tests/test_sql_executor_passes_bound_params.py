"""
test_sql_executor_passes_bound_params.py

Contract: execute_command() forwards the parameters dict as real bind
parameters (:name markers already prepared by sql_parameter_parser, a
separate module) — a value flows through untouched by string building.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_executor import execute_command


class TestSqlExecutorPassesBoundParams(unittest.TestCase):

    def test_single_bind_param_is_forwarded(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = execute_command(spec, "SELECT :n AS n", {"n": 42})
        self.assertEqual(result.rows, [{"n": 42}])

    def test_multiple_bind_params_are_forwarded(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = execute_command(spec, "SELECT :a AS a, :b AS b", {"a": 1, "b": "x"})
        self.assertEqual(result.rows, [{"a": 1, "b": "x"}])


if __name__ == "__main__":
    unittest.main()
