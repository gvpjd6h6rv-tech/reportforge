"""
test_stored_procedure_catalog_lists_mssql_procedures_via_executor.py

Contract: for an mssql connection spec, list_procedures() delegates the
actual query to sql_executor.execute_command (never a direct driver
call), running a read-only SELECT against sys.procedures, and maps the
returned rows to a plain list of names.

GAP DECLARED: no real MSSQL server is available in this environment —
execute_command is mocked to simulate what a real sys.procedures query
would return. This test's contract is about the CATALOG's own mapping/
delegation behavior, not a production-verified MSSQL round trip.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_execution_result import SqlExecutionResult
from reportforge.core.render.datasource.stored_procedure_catalog import list_procedures


class TestStoredProcedureCatalogListsMssqlProceduresViaExecutor(unittest.TestCase):

    def test_lists_procedure_names_from_executor_result(self):
        fake_result = SqlExecutionResult(
            rows=[{"name": "MiReporteVentas"}, {"name": "OtroReporte"}],
            columns=["name"], elapsed_ms=1.0, row_count=2, warnings=[],
        )
        spec = {"type": "mssql", "url": "mssql+pymssql://x:y@h/d"}
        with patch(
            "reportforge.core.render.datasource.stored_procedure_catalog.execute_command",
            return_value=fake_result,
        ) as mock_exec:
            names, warnings = list_procedures(spec)
        self.assertEqual(names, ["MiReporteVentas", "OtroReporte"])
        self.assertEqual(warnings, [])
        mock_exec.assert_called_once()
        called_spec, called_sql = mock_exec.call_args[0][0], mock_exec.call_args[0][1]
        self.assertEqual(called_spec, spec)
        self.assertIn("sys.procedures", called_sql)


if __name__ == "__main__":
    unittest.main()
