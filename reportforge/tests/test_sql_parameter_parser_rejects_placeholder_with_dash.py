"""
test_sql_parameter_parser_rejects_placeholder_with_dash.py

Contract: a placeholder containing a dash ({?Fecha-Desde}) is rejected —
a valid identifier is [A-Za-z_][A-Za-z0-9_]* only.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlParameterParserRejectsPlaceholderWithDash(unittest.TestCase):

    def test_dash_in_identifier_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_parameters("SELECT * FROM t WHERE x = {?Fecha-Desde}")


if __name__ == "__main__":
    unittest.main()
