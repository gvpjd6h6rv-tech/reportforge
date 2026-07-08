"""
test_sql_parameter_parser_two_params_preserves_order.py

Contract: multiple distinct {?Name} placeholders are all detected, in
first-occurrence order (not sorted, not reversed).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlParameterParserTwoParamsPreservesOrder(unittest.TestCase):

    def test_two_placeholders_detected_in_first_occurrence_order(self):
        sql = "SELECT DocNum FROM OINV WHERE DocDate >= {?FechaDesde} AND DocDate <= {?FechaHasta}"
        result = parse_parameters(sql)
        self.assertEqual(result.parameters, ["FechaDesde", "FechaHasta"])
        self.assertEqual(result.bind_order, ["FechaDesde", "FechaHasta"])
        self.assertEqual(
            result.prepared_sql,
            "SELECT DocNum FROM OINV WHERE DocDate >= :FechaDesde AND DocDate <= :FechaHasta",
        )

    def test_order_matches_reversed_appearance_when_reversed_in_sql(self):
        sql = "SELECT * FROM OINV WHERE DocDate <= {?FechaHasta} AND DocDate >= {?FechaDesde}"
        result = parse_parameters(sql)
        self.assertEqual(result.parameters, ["FechaHasta", "FechaDesde"])


if __name__ == "__main__":
    unittest.main()
