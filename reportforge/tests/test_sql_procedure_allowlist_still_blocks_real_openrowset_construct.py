"""
test_sql_procedure_allowlist_still_blocks_real_openrowset_construct.py

Contract: the GAP-2 fix must NOT create a bypass — a REAL OPENROWSET/
OPENDATASOURCE function call OUTSIDE any string literal is still
detected and blocked, including when a harmless string literal mentioning
the same word is also present elsewhere in the statement.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_procedure_allowlist import is_dangerous_construct
from reportforge.core.render.datasource.sql_safety_guard import check


class TestSqlProcedureAllowlistStillBlocksRealOpenrowsetConstruct(unittest.TestCase):

    def test_real_openrowset_call_is_still_detected(self):
        self.assertTrue(is_dangerous_construct("SELECT * FROM OPENROWSET('SQLNCLI', 'server=x', 'SELECT 1')"))

    def test_real_opendatasource_call_is_still_detected(self):
        self.assertTrue(is_dangerous_construct("SELECT * FROM OPENDATASOURCE('SQLNCLI', 'server=x').db.dbo.t"))

    def test_real_construct_outside_string_blocked_even_with_a_harmless_literal_present(self):
        sql = "SELECT * FROM OPENROWSET('SQLNCLI','s','q') WHERE Comentario = 'mentions OPENROWSET too'"
        self.assertTrue(is_dangerous_construct(sql))
        verdict = check(sql)
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:DANGEROUS_CONSTRUCT")

    def test_full_guard_still_blocks_real_construct(self):
        verdict = check("SELECT * FROM OPENROWSET('SQLNCLI', 'server=x', 'SELECT 1')")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:DANGEROUS_CONSTRUCT")


if __name__ == "__main__":
    unittest.main()
