"""
test_stored_procedure_catalog_rejects_xp_sp_names.py

Contract: an identifier prefixed with xp_/sp_ (case-insensitive) is
rejected even though it's otherwise a syntactically valid identifier —
mirrors sql_procedure_allowlist's own hard-block for the same prefixes,
applied here at the catalog's identifier-construction boundary.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.stored_procedure_catalog import (
    build_stored_procedure_command,
    validate_procedure_identifier,
)


class TestStoredProcedureCatalogRejectsXpSpNames(unittest.TestCase):

    def test_xp_prefix_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_procedure_identifier("xp_cmdshell")

    def test_sp_prefix_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_procedure_identifier("sp_configure")

    def test_prefix_check_is_case_insensitive(self):
        with self.assertRaises(ValueError):
            validate_procedure_identifier("XP_CmdShell")
        with self.assertRaises(ValueError):
            validate_procedure_identifier("Sp_Configure")

    def test_build_command_rejects_xp_prefixed_name(self):
        with self.assertRaises(ValueError):
            build_stored_procedure_command("xp_cmdshell")


if __name__ == "__main__":
    unittest.main()
