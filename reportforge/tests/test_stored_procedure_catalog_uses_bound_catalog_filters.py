"""
test_stored_procedure_catalog_uses_bound_catalog_filters.py

Contract (C-F7-008): read_procedure_parameters()'s procedure-name filter
is passed as a SEPARATE bind-parameters dict argument to execute_command,
never string-interpolated into the SQL text itself — the SQL string
always contains the literal ":procedure_name" placeholder, regardless of
what name is being looked up.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_execution_result import SqlExecutionResult
from reportforge.core.render.datasource.stored_procedure_catalog import read_procedure_parameters


class TestStoredProcedureCatalogUsesBoundCatalogFilters(unittest.TestCase):

    def test_procedure_name_is_passed_as_bind_param_not_interpolated(self):
        fake_result = SqlExecutionResult(rows=[], columns=[], elapsed_ms=1, row_count=0, warnings=[])
        spec = {"type": "mssql", "url": "mssql+pymssql://x:y@h/d"}
        with patch(
            "reportforge.core.render.datasource.stored_procedure_catalog.execute_command",
            return_value=fake_result,
        ) as mock_exec:
            read_procedure_parameters(spec, "MiReporteVentas")
        args, kwargs = mock_exec.call_args
        called_sql = args[1]
        called_params = args[2] if len(args) > 2 else kwargs.get("parameters")
        self.assertNotIn("MiReporteVentas", called_sql)
        self.assertIn(":procedure_name", called_sql)
        self.assertEqual(called_params, {"procedure_name": "MiReporteVentas"})


if __name__ == "__main__":
    unittest.main()
