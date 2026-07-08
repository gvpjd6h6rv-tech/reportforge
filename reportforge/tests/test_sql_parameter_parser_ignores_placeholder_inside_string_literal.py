"""
test_sql_parameter_parser_ignores_placeholder_inside_string_literal.py

Contract (explicit decision, documented in sql_parameter_parser.py):
anything inside a single-quoted SQL string literal is never parsed as a
placeholder — not extracted into parameters, not rewritten in
prepared_sql, and NOT rejected even if it's shaped like an invalid
placeholder (it's just string data, not a placeholder attempt). Escaped
quotes ('') inside a literal must not be mistaken for the string's end.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlParameterParserIgnoresPlaceholderInsideStringLiteral(unittest.TestCase):

    def test_valid_shaped_placeholder_inside_string_is_not_extracted(self):
        sql = "SELECT * FROM t WHERE Comentario = '{?NoParametro}'"
        result = parse_parameters(sql)
        self.assertEqual(result.parameters, [])
        self.assertEqual(result.prepared_sql, sql)

    def test_real_placeholder_outside_string_is_still_detected_alongside_one_inside(self):
        sql = "SELECT * FROM t WHERE Comentario = '{?NoParametro}' AND CardCode = {?CardCode}"
        result = parse_parameters(sql)
        self.assertEqual(result.parameters, ["CardCode"])
        self.assertIn("'{?NoParametro}'", result.prepared_sql)
        self.assertIn(":CardCode", result.prepared_sql)

    def test_invalid_shaped_placeholder_inside_string_does_not_raise(self):
        sql = "SELECT * FROM t WHERE Comentario = '{?Fecha Desde}'"
        result = parse_parameters(sql)  # must not raise
        self.assertEqual(result.parameters, [])

    def test_escaped_quote_inside_string_does_not_end_the_literal_early(self):
        sql = "SELECT * FROM t WHERE x = 'it''s {?Ignored}' AND y = {?Real}"
        result = parse_parameters(sql)
        self.assertEqual(result.parameters, ["Real"])
        self.assertIn("{?Ignored}", result.prepared_sql)


if __name__ == "__main__":
    unittest.main()
