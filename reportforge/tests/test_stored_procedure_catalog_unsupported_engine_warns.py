"""
test_stored_procedure_catalog_unsupported_engine_warns.py

Contract: an engine type that is neither sqlite nor mssql returns an
empty list with an explicit warning naming the engine type — never a
crash, never a silently empty result with no explanation.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.stored_procedure_catalog import list_procedures, read_procedure_parameters


class TestStoredProcedureCatalogUnsupportedEngineWarns(unittest.TestCase):

    def test_list_procedures_warns_for_unsupported_engine(self):
        names, warnings = list_procedures({"type": "oracle"})
        self.assertEqual(names, [])
        self.assertEqual(len(warnings), 1)
        self.assertIn("oracle", warnings[0])

    def test_read_procedure_parameters_warns_for_unsupported_engine(self):
        params, warnings = read_procedure_parameters({"type": "postgres"}, "SomeProc")
        self.assertEqual(params, [])
        self.assertEqual(len(warnings), 1)
        self.assertIn("postgres", warnings[0])


if __name__ == "__main__":
    unittest.main()
