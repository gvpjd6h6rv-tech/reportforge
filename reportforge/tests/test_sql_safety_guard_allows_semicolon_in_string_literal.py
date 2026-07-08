"""
test_sql_safety_guard_allows_semicolon_in_string_literal.py

Contract (GAP-1 fix, RF-SQL-GUARD-STRING-AWARE-1): a semicolon inside a
string literal is NOT a statement separator — a single legitimate SELECT
with such a value must be allowed, not rejected as MULTI_STATEMENT.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_safety_guard import check


class TestSqlSafetyGuardAllowsSemicolonInStringLiteral(unittest.TestCase):

    def test_semicolon_inside_string_literal_is_allowed(self):
        verdict = check("SELECT 'a;b' AS x")
        self.assertTrue(verdict["allowed"])
        self.assertEqual(verdict["kind"], "SELECT")

    def test_semicolon_inside_literal_alongside_where_clause_is_allowed(self):
        verdict = check("SELECT * FROM OCRD WHERE CardName = 'Cliente; VIP'")
        self.assertTrue(verdict["allowed"])


if __name__ == "__main__":
    unittest.main()
