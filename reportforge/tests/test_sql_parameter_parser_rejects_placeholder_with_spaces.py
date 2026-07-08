"""
test_sql_parameter_parser_rejects_placeholder_with_spaces.py

Contract: a placeholder with an internal space ({?Fecha Desde} or the
leading-space variant {? FechaDesde}) is rejected — a valid identifier has
no whitespace.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlParameterParserRejectsPlaceholderWithSpaces(unittest.TestCase):

    def test_internal_space_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_parameters("SELECT * FROM t WHERE x = {?Fecha Desde}")

    def test_leading_space_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_parameters("SELECT * FROM t WHERE x = {? FechaDesde}")


if __name__ == "__main__":
    unittest.main()
