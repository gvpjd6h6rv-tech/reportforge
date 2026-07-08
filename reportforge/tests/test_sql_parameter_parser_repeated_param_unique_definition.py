"""
test_sql_parameter_parser_repeated_param_unique_definition.py

Contract: the same {?Name} appearing more than once produces exactly ONE
entry in parameters/bind_order — no duplicate definitions.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlParameterParserRepeatedParamUniqueDefinition(unittest.TestCase):

    def test_repeated_placeholder_yields_one_unique_parameter(self):
        sql = "SELECT * FROM OINV WHERE DocDate >= {?Fecha} OR UpdateDate >= {?Fecha}"
        result = parse_parameters(sql)
        self.assertEqual(result.parameters, ["Fecha"])
        self.assertEqual(result.bind_order, ["Fecha"])

    def test_repeated_placeholder_used_three_times_still_yields_one_definition(self):
        sql = "SELECT * FROM t WHERE a = {?X} OR b = {?X} OR c = {?X}"
        result = parse_parameters(sql)
        self.assertEqual(result.parameters, ["X"])


if __name__ == "__main__":
    unittest.main()
