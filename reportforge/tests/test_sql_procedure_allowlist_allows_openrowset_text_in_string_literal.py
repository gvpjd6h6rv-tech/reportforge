"""
test_sql_procedure_allowlist_allows_openrowset_text_in_string_literal.py

Contract (GAP-2 fix, RF-SQL-GUARD-STRING-AWARE-1): the word "OPENROWSET"
appearing as plain string DATA (e.g. a comment field's value) is not a
real dangerous construct — is_dangerous_construct() must return False,
and the full guard must allow the statement.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_procedure_allowlist import is_dangerous_construct
from reportforge.core.render.datasource.sql_safety_guard import check


class TestSqlProcedureAllowlistAllowsOpenrowsetTextInStringLiteral(unittest.TestCase):

    def test_is_dangerous_construct_ignores_text_inside_a_literal(self):
        self.assertFalse(is_dangerous_construct("SELECT 'mentions OPENROWSET in text' AS x"))

    def test_is_dangerous_construct_ignores_opendatasource_text_inside_a_literal(self):
        self.assertFalse(is_dangerous_construct("SELECT 'mentions OPENDATASOURCE in text' AS x"))

    def test_full_guard_allows_the_statement(self):
        verdict = check("SELECT 'mentions OPENROWSET in text' AS x")
        self.assertTrue(verdict["allowed"])


if __name__ == "__main__":
    unittest.main()
