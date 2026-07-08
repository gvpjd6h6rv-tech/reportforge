"""
test_stored_procedure_catalog_does_not_call_allowlist.py

Contract: listing/reading/building a stored procedure command NEVER
authorizes it for execution — sql_procedure_allowlist.add_to_allowlist is
never called anywhere in this module, statically (import check) and
dynamically (spy check across all three public functions).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

import reportforge.core.render.datasource.stored_procedure_catalog as catalog_module
from reportforge.core.render.datasource.sql_execution_result import SqlExecutionResult
from reportforge.core.render.datasource.stored_procedure_catalog import (
    build_stored_procedure_command,
    list_procedures,
    read_procedure_parameters,
)


class TestStoredProcedureCatalogDoesNotCallAllowlist(unittest.TestCase):

    def test_module_does_not_import_allowlist_add_function(self):
        self.assertFalse(hasattr(catalog_module, "add_to_allowlist"))

    def test_none_of_the_three_public_functions_touch_the_allowlist(self):
        with patch("reportforge.core.render.datasource.sql_procedure_allowlist.add_to_allowlist") as mock_add:
            list_procedures({"type": "sqlite", "path": ":memory:"})
            read_procedure_parameters({"type": "sqlite", "path": ":memory:"}, "AnyProc")
            build_stored_procedure_command("AnyProc")

            fake_result = SqlExecutionResult(rows=[{"name": "X"}], columns=["name"], elapsed_ms=1, row_count=1, warnings=[])
            with patch(
                "reportforge.core.render.datasource.stored_procedure_catalog.execute_command",
                return_value=fake_result,
            ):
                list_procedures({"type": "mssql", "url": "mssql+pymssql://x:y@h/d"})

            mock_add.assert_not_called()


if __name__ == "__main__":
    unittest.main()
