"""
test_sql_schema_inspector_procedure_schema.py

Contract: inspect_schema() handles a stored-procedure-shaped command
(EXEC ...) through the exact same code path as a plain query — no
separate stored-procedure logic exists in this module (Fase 7's catalog
is a different, later concern). sqlite has no real EXEC support, so the
underlying execution is mocked here to simulate what a real EXEC
resultset would return; this test's contract is about the INSPECTOR's
handling of the shape, not about real stored procedure execution.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_execution_result import SqlExecutionResult
from reportforge.core.render.datasource.sql_schema_inspector import inspect_schema


class TestSqlSchemaInspectorProcedureSchema(unittest.TestCase):

    def test_exec_shaped_command_infers_columns_the_same_way_as_a_query(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        fake_result = SqlExecutionResult(
            rows=[{"DocNum": 1001, "CardName": "Cliente Uno"}],
            columns=["DocNum", "CardName"],
            elapsed_ms=1.2,
            row_count=1,
            warnings=[],
        )
        with patch("reportforge.core.render.datasource.sql_schema_inspector.execute_command", return_value=fake_result):
            result = inspect_schema(spec, "EXEC MiReporteVentas :FechaDesde", {"FechaDesde": "2026-01-01"})
        by_name = {c.name: c for c in result.columns}
        self.assertEqual(by_name["DocNum"].rf_type, "number")
        self.assertEqual(by_name["CardName"].rf_type, "string")
        self.assertEqual(result.warnings, [])


if __name__ == "__main__":
    unittest.main()
