"""
test_sql_parameter_parser_single_param.py

Contract: a SQL template with exactly one {?Name} placeholder detects that
one name and rewrites it to a driver-safe :Name bind marker.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlParameterParserSingleParam(unittest.TestCase):

    def test_single_placeholder_is_detected_and_rewritten(self):
        result = parse_parameters("SELECT CardCode FROM OCRD WHERE CardCode = {?CardCode}")
        self.assertEqual(result.parameters, ["CardCode"])
        self.assertEqual(result.bind_order, ["CardCode"])
        self.assertEqual(result.prepared_sql, "SELECT CardCode FROM OCRD WHERE CardCode = :CardCode")


if __name__ == "__main__":
    unittest.main()
