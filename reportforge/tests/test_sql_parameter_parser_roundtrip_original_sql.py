"""
test_sql_parameter_parser_roundtrip_original_sql.py

Contract: original_sql always preserves the exact input string, byte for
byte, regardless of what prepared_sql rewrote — the caller can always
recover exactly what was originally typed.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlParameterParserRoundtripOriginalSql(unittest.TestCase):

    def test_original_sql_is_preserved_exactly_with_params(self):
        sql = "SELECT DocNum FROM OINV WHERE DocDate >= {?FechaDesde} AND DocDate <= {?FechaHasta}"
        result = parse_parameters(sql)
        self.assertEqual(result.original_sql, sql)

    def test_original_sql_is_preserved_exactly_with_no_params(self):
        sql = "SELECT TOP 10 CardCode FROM OCRD"
        result = parse_parameters(sql)
        self.assertEqual(result.original_sql, sql)

    def test_original_sql_is_independent_of_prepared_sql_mutation(self):
        sql = "SELECT * FROM t WHERE x = {?A}"
        result = parse_parameters(sql)
        self.assertNotEqual(result.original_sql, result.prepared_sql)
        self.assertEqual(result.original_sql, sql)


if __name__ == "__main__":
    unittest.main()
