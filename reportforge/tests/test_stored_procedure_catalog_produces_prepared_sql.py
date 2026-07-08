"""
test_stored_procedure_catalog_produces_prepared_sql.py

Contract (GAP-3 fix, cross-check): build_stored_procedure_command() was
already producing ":Name"-style prepared SQL before GAP-3 was fixed — this
test locks that in as a contract, proving Phase 7's own output is (and
remains) compliant with SqlCommandModel's new enforced format, not merely
compatible by accident.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_parameter_model import SqlParameterModel
from reportforge.core.render.datasource.stored_procedure_catalog import build_stored_procedure_command


class TestStoredProcedureCatalogProducesPreparedSql(unittest.TestCase):

    def test_command_with_parameters_has_no_raw_crystal_placeholder(self):
        params = [SqlParameterModel(name="FechaDesde", type="date", source="procedure_param")]
        cmd = build_stored_procedure_command("MiReporteVentas", params)  # would raise if non-compliant
        self.assertNotIn("{?", cmd.sql)
        self.assertIn(":FechaDesde", cmd.sql)

    def test_command_with_no_parameters_is_also_compliant(self):
        cmd = build_stored_procedure_command("MiReporteVentas")
        self.assertNotIn("{?", cmd.sql)


if __name__ == "__main__":
    unittest.main()
