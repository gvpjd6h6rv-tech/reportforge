"""
test_stored_procedure_catalog_sqlite_returns_empty.py

Contract: SQLite has no stored procedures — list_procedures() and
read_procedure_parameters() return an honest empty result, not a
simulated one, and no warning (this isn't an error, it's a real engine
capability limit).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.stored_procedure_catalog import list_procedures, read_procedure_parameters


class TestStoredProcedureCatalogSqliteReturnsEmpty(unittest.TestCase):

    def test_list_procedures_returns_empty_for_sqlite(self):
        names, warnings = list_procedures({"type": "sqlite", "path": ":memory:"})
        self.assertEqual(names, [])
        self.assertEqual(warnings, [])

    def test_read_procedure_parameters_returns_empty_for_sqlite(self):
        params, warnings = read_procedure_parameters({"type": "sqlite", "path": ":memory:"}, "AnyProc")
        self.assertEqual(params, [])
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
