"""
test_sql_parameter_parser_rejects_empty_placeholder.py

Contract: an empty {?} placeholder (no identifier at all) is rejected
with a clear error, never silently ignored or treated as a valid
zero-length parameter name.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlParameterParserRejectsEmptyPlaceholder(unittest.TestCase):

    def test_empty_placeholder_raises_value_error(self):
        with self.assertRaises(ValueError):
            parse_parameters("SELECT * FROM t WHERE x = {?}")

    def test_empty_placeholder_error_names_the_snippet(self):
        try:
            parse_parameters("SELECT * FROM t WHERE x = {?}")
            self.fail("expected ValueError")
        except ValueError as e:
            self.assertIn("{?}", str(e))


if __name__ == "__main__":
    unittest.main()
