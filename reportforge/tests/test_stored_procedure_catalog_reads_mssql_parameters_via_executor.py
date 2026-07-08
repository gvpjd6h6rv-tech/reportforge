"""
test_stored_procedure_catalog_reads_mssql_parameters_via_executor.py

Contract: read_procedure_parameters() delegates to sql_executor.
execute_command against sys.parameters/sys.procedures, mapping each
returned row to a SqlParameterModel with the correct rf_type inferred
from the SQL type name.

GAP DECLARED: no real MSSQL server available — execute_command is
mocked, same as the sibling "lists" test.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_execution_result import SqlExecutionResult
from reportforge.core.render.datasource.sql_parameter_model import SqlParameterModel
from reportforge.core.render.datasource.stored_procedure_catalog import read_procedure_parameters


class TestStoredProcedureCatalogReadsMssqlParametersViaExecutor(unittest.TestCase):

    def test_reads_parameters_with_correct_rf_type(self):
        fake_result = SqlExecutionResult(
            rows=[
                {"param_name": "FechaDesde", "param_type": "date"},
                {"param_name": "Cantidad", "param_type": "int"},
                {"param_name": "Activo", "param_type": "bit"},
            ],
            columns=["param_name", "param_type"], elapsed_ms=1.0, row_count=3, warnings=[],
        )
        spec = {"type": "mssql", "url": "mssql+pymssql://x:y@h/d"}
        with patch(
            "reportforge.core.render.datasource.stored_procedure_catalog.execute_command",
            return_value=fake_result,
        ):
            params, warnings = read_procedure_parameters(spec, "MiReporteVentas")
        self.assertEqual(warnings, [])
        self.assertEqual(len(params), 3)
        by_name = {p.name: p for p in params}
        self.assertEqual(by_name["FechaDesde"].type, "date")
        self.assertEqual(by_name["Cantidad"].type, "number")
        self.assertEqual(by_name["Activo"].type, "boolean")
        self.assertTrue(all(isinstance(p, SqlParameterModel) for p in params))


if __name__ == "__main__":
    unittest.main()
