"""
test_stored_procedure_catalog_does_not_execute_exec.py

Contract: build_stored_procedure_command() only CONSTRUCTS a SqlCommandModel
whose .sql is an EXEC template — it never calls sql_executor.execute_command
itself. The catalog's only executor calls are the read-only catalog SELECTs
in list_procedures/read_procedure_parameters.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.stored_procedure_catalog import build_stored_procedure_command


class TestStoredProcedureCatalogDoesNotExecuteExec(unittest.TestCase):

    def test_build_stored_procedure_command_never_calls_executor(self):
        with patch("reportforge.core.render.datasource.stored_procedure_catalog.execute_command") as mock_exec:
            build_stored_procedure_command("MiReporteVentas")
            mock_exec.assert_not_called()


if __name__ == "__main__":
    unittest.main()
