"""
test_sql_safety_guard_still_blocks_real_multi_statement.py

Contract: the GAP-1 fix (ignoring ';' inside string literals) must NOT
create a bypass — a real second statement OUTSIDE any string literal is
still rejected as MULTI_STATEMENT, including when a string literal
appears elsewhere in the same input.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_safety_guard import check


class TestSqlSafetyGuardStillBlocksRealMultiStatement(unittest.TestCase):

    def test_plain_two_statements_still_blocked(self):
        verdict = check("SELECT 1; SELECT 2")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "MULTI_STATEMENT")

    def test_destructive_second_statement_still_blocked_even_with_a_literal_present(self):
        verdict = check("SELECT 'a;b' AS x; DROP TABLE foo")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "MULTI_STATEMENT")


if __name__ == "__main__":
    unittest.main()
