"""
test_sql_parameter_parser_repeated_param_bind_references.py

Contract: a repeated {?Name} placeholder is rewritten at EVERY occurrence
in prepared_sql (not just the first) — one definition, but every
reference site still gets its own :Name marker so the driver binds the
same value at each site. Both sqlite3's DB-API and SQLAlchemy's text()
accept the same named parameter appearing multiple times in one query.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlParameterParserRepeatedParamBindReferences(unittest.TestCase):

    def test_every_occurrence_is_rewritten_not_just_the_first(self):
        sql = "SELECT * FROM OINV WHERE DocDate >= {?Fecha} OR UpdateDate >= {?Fecha}"
        result = parse_parameters(sql)
        self.assertEqual(
            result.prepared_sql,
            "SELECT * FROM OINV WHERE DocDate >= :Fecha OR UpdateDate >= :Fecha",
        )
        self.assertEqual(result.prepared_sql.count(":Fecha"), 2)

    def test_three_occurrences_all_rewritten(self):
        sql = "SELECT * FROM t WHERE a = {?X} OR b = {?X} OR c = {?X}"
        result = parse_parameters(sql)
        self.assertEqual(result.prepared_sql.count(":X"), 3)
        self.assertNotIn("{?X}", result.prepared_sql)


if __name__ == "__main__":
    unittest.main()
