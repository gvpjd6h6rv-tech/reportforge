"""
test_sql_command_model_rejects_raw_crystal_placeholder.py

Contract (GAP-3 fix, RF-SQL-COMMAND-MODEL-SQL-FORMAT-1): SqlCommandModel.sql
must always be already-prepared SQL (":Name" bind markers). Constructing
one with raw Crystal-style "{?Param}" syntax still present is rejected
immediately with a ValueError naming the offending SQL — the caller must
run sql_parameter_parser.parse_parameters() first and store its
.prepared_sql, never the original raw text.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_command_model import SqlCommandModel
from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters


class TestSqlCommandModelRejectsRawCrystalPlaceholder(unittest.TestCase):

    def test_raw_placeholder_in_sql_is_rejected(self):
        with self.assertRaises(ValueError):
            SqlCommandModel(id="cmd-1", name="X", sql="SELECT * FROM OINV WHERE DocDate >= {?FechaDesde}")

    def test_from_dict_with_raw_placeholder_is_also_rejected(self):
        with self.assertRaises(ValueError):
            SqlCommandModel.from_dict({"id": "cmd-2", "name": "X", "sql": "SELECT * WHERE x = {?Y}"})

    def test_error_names_the_offending_sql(self):
        try:
            SqlCommandModel(id="cmd-3", name="X", sql="SELECT {?A}")
            self.fail("expected ValueError")
        except ValueError as e:
            self.assertIn("{?A}", str(e))

    def test_already_prepared_sql_from_the_real_parser_is_accepted(self):
        parsed = parse_parameters("SELECT * FROM OINV WHERE DocDate >= {?FechaDesde}")
        # Must NOT raise — this is exactly the intended flow: parse first,
        # store the RESULT, never the original raw text.
        cmd = SqlCommandModel(id="cmd-4", name="Ventas", sql=parsed.prepared_sql)
        self.assertEqual(cmd.sql, "SELECT * FROM OINV WHERE DocDate >= :FechaDesde")

    def test_plain_sql_with_no_placeholders_at_all_is_accepted(self):
        SqlCommandModel(id="cmd-5", name="X", sql="SELECT TOP 10 CardCode FROM OCRD")  # must not raise


if __name__ == "__main__":
    unittest.main()
