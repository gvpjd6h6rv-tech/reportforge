"""
test_sql_parameter_parser_no_params.py

Contract: a SQL template with no {?Name} placeholders returns an
equivalent prepared_sql (unchanged), empty parameters, empty bind_order.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlParameterParserNoParams(unittest.TestCase):

    def test_no_placeholders_returns_unchanged_sql_and_empty_lists(self):
        sql = "SELECT TOP 10 CardCode FROM OCRD"
        result = parse_parameters(sql)
        self.assertEqual(result.prepared_sql, sql)
        self.assertEqual(result.parameters, [])
        self.assertEqual(result.bind_order, [])
        self.assertEqual(result.original_sql, sql)


if __name__ == "__main__":
    unittest.main()
