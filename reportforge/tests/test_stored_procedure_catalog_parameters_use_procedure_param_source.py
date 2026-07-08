"""
test_stored_procedure_catalog_parameters_use_procedure_param_source.py

Contract: every SqlParameterModel produced by reading a procedure's
parameters carries source="procedure_param" — distinguishing it from a
manually-defined or SQL-command-parsed parameter.
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


class TestStoredProcedureCatalogParametersUseProcedureParamSource(unittest.TestCase):

    def test_all_parameters_have_procedure_param_source(self):
        fake_result = SqlExecutionResult(
            rows=[{"param_name": "FechaDesde", "param_type": "date"}],
            columns=["param_name", "param_type"], elapsed_ms=1.0, row_count=1, warnings=[],
        )
        spec = {"type": "mssql", "url": "mssql+pymssql://x:y@h/d"}
        with patch(
            "reportforge.core.render.datasource.stored_procedure_catalog.execute_command",
            return_value=fake_result,
        ):
            params, _ = read_procedure_parameters(spec, "MiReporteVentas")
        self.assertTrue(all(p.source == "procedure_param" for p in params))


if __name__ == "__main__":
    unittest.main()
