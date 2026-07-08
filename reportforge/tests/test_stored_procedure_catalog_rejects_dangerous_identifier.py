"""
test_stored_procedure_catalog_rejects_dangerous_identifier.py

Contract: any procedure/schema identifier containing ; -- /* */, spaces,
brackets, quotes, or more than one qualifier dot is rejected BEFORE a
SqlCommandModel is built or a parameter lookup runs — never silently
passed through into the .sql template or a catalog query.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.stored_procedure_catalog import (
    build_stored_procedure_command,
    read_procedure_parameters,
    validate_procedure_identifier,
)

_DANGEROUS_NAMES = [
    "Proc;DROP TABLE x",
    "Proc-- comment",
    "Proc/*comment*/",
    "[Proc]",
    "Proc'",
    'Proc"',
    "a.b.c",
    "Proc Name",
    "",
]


class TestStoredProcedureCatalogRejectsDangerousIdentifier(unittest.TestCase):

    def test_validate_procedure_identifier_rejects_all_dangerous_shapes(self):
        for name in _DANGEROUS_NAMES:
            with self.assertRaises(ValueError, msg=f"should have rejected {name!r}"):
                validate_procedure_identifier(name)

    def test_build_stored_procedure_command_rejects_dangerous_identifier(self):
        with self.assertRaises(ValueError):
            build_stored_procedure_command("Proc;DROP TABLE x")

    def test_read_procedure_parameters_rejects_dangerous_identifier(self):
        with self.assertRaises(ValueError):
            read_procedure_parameters({"type": "mssql", "url": "x"}, "Proc'; DROP TABLE x --")


if __name__ == "__main__":
    unittest.main()
