"""
test_stored_procedure_catalog_builds_sql_command_model.py

Contract: build_stored_procedure_command() returns a SqlCommandModel with
command_type="stored_procedure" and a .sql template of the shape
"EXEC name :p1, :p2" — built, never executed.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_command_model import SqlCommandModel
from reportforge.core.render.datasource.sql_parameter_model import SqlParameterModel
from reportforge.core.render.datasource.stored_procedure_catalog import build_stored_procedure_command


class TestStoredProcedureCatalogBuildsSqlCommandModel(unittest.TestCase):

    def test_builds_command_with_no_parameters(self):
        cmd = build_stored_procedure_command("MiReporteVentas")
        self.assertIsInstance(cmd, SqlCommandModel)
        self.assertEqual(cmd.command_type, "stored_procedure")
        self.assertEqual(cmd.sql, "EXEC MiReporteVentas")

    def test_builds_command_with_parameters(self):
        params = [
            SqlParameterModel(name="FechaDesde", type="date", source="procedure_param"),
            SqlParameterModel(name="FechaHasta", type="date", source="procedure_param"),
        ]
        cmd = build_stored_procedure_command("MiReporteVentas", params)
        self.assertEqual(cmd.sql, "EXEC MiReporteVentas :FechaDesde, :FechaHasta")
        self.assertEqual(len(cmd.parameters), 2)


if __name__ == "__main__":
    unittest.main()
