"""
test_sql_executor_applies_timeout.py

Contract: execute_command() always resolves a bounded timeout (via
sql_query_limits.resolve_timeout) and threads it into the spec passed to
the underlying plumbing — never "no timeout at all", never an absurd
caller-supplied value passed through unbounded.

Full driver-level socket timeout enforcement for every dialect is a known,
already-documented follow-up (see sql_executor.py's own docstring and
Security Patch 0's commit message) — not tested here, since a real cutoff
would need a genuinely slow query, out of proportion for this contract.
What IS verified: the resolved value reaching the plumbing layer is
always bounded and sane.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_executor import execute_command
from reportforge.core.render.datasource.sql_query_limits import DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS


class TestSqlExecutorAppliesTimeout(unittest.TestCase):

    def test_missing_timeout_resolves_to_default_in_the_spec_passed_downstream(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        with patch("reportforge.core.render.datasource.sql_executor.load_spec") as mock_load:
            mock_load.return_value = {"items": []}
            execute_command(spec, "SELECT 1")
            passed_spec = mock_load.call_args[0][0]
            self.assertEqual(passed_spec["timeout"], float(DEFAULT_TIMEOUT_SECONDS))

    def test_absurd_timeout_is_capped_in_the_spec_passed_downstream(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        with patch("reportforge.core.render.datasource.sql_executor.load_spec") as mock_load:
            mock_load.return_value = {"items": []}
            execute_command(spec, "SELECT 1", timeout=999999)
            passed_spec = mock_load.call_args[0][0]
            self.assertEqual(passed_spec["timeout"], float(MAX_TIMEOUT_SECONDS))

    def test_valid_explicit_timeout_still_executes_successfully(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = execute_command(spec, "SELECT 1 AS x", timeout=5)
        self.assertEqual(result.rows, [{"x": 1}])


if __name__ == "__main__":
    unittest.main()
