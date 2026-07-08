"""
test_sql_string_literal_mask_roundtrip.py

Contract: string_literal_mask() correctly marks positions inside a
single-quoted literal (including escaped '' quotes) and leaves everything
outside unmarked. Shared by sql_parameter_parser, sql_safety_guard, and
sql_procedure_allowlist (RF-SQL-GUARD-STRING-AWARE-1) — this is the one
place that logic is tested directly.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_string_literal_mask import string_literal_mask


class TestSqlStringLiteralMaskRoundtrip(unittest.TestCase):

    def test_no_quotes_everything_unmarked(self):
        mask = string_literal_mask("SELECT 1")
        self.assertEqual(mask, [False] * len("SELECT 1"))

    def test_simple_literal_is_marked_including_quotes(self):
        sql = "x = 'ab'"
        mask = string_literal_mask(sql)
        # positions of the quotes and 'a','b' should all be True
        self.assertTrue(mask[sql.index("'")])
        self.assertTrue(mask[sql.index("a")])
        self.assertTrue(mask[sql.index("b")])
        self.assertFalse(mask[0])  # 'x' outside

    def test_escaped_quote_does_not_end_the_literal_early(self):
        sql = "x = 'it''s ok'"
        mask = string_literal_mask(sql)
        # everything from the first ' to the last ' should be marked
        first = sql.index("'")
        last = sql.rindex("'")
        self.assertTrue(all(mask[first:last + 1]))

    def test_content_after_closed_literal_is_unmarked(self):
        sql = "'a' AND b = 1"
        mask = string_literal_mask(sql)
        self.assertFalse(mask[sql.index("AND")])


if __name__ == "__main__":
    unittest.main()
