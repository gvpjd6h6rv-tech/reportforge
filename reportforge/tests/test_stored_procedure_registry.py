"""
test_stored_procedure_registry.py

Contract: stored_procedure_registry holds the F19C allowlist and looks it
up by ID — never exposes datasourceId/real procedure name via
list_enabled(), and keeps sql_procedure_allowlist in sync with each
definition's enabled flag.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource import stored_procedure_registry as reg
from reportforge.core.render.datasource import sql_procedure_allowlist as allowlist


def _def(**overrides):
    base = {
        "id": "demo", "label": "Demo", "datasourceId": "ds1", "procedure": "dbo.usp_Demo",
        "enabled": True, "readOnly": True, "timeoutSeconds": 10, "maxRows": 100,
        "params": [{"name": "CardCode", "type": "string", "required": True, "maxLength": 30}],
    }
    base.update(overrides)
    return base


class TestStoredProcedureRegistry(unittest.TestCase):

    def setUp(self):
        reg.clear()
        allowlist.clear_allowlist()

    def tearDown(self):
        reg.clear()
        allowlist.clear_allowlist()

    def test_get_definition_returns_registered_definition(self):
        reg.register_definition(_def())
        self.assertEqual(reg.get_definition("demo")["procedure"], "dbo.usp_Demo")

    def test_get_definition_returns_none_for_unknown_id(self):
        self.assertIsNone(reg.get_definition("nope"))

    def test_list_enabled_excludes_disabled(self):
        reg.register_definition(_def(id="a", enabled=True))
        reg.register_definition(_def(id="b", enabled=False))
        ids = [p["id"] for p in reg.list_enabled()]
        self.assertEqual(ids, ["a"])

    def test_list_enabled_never_exposes_datasource_id(self):
        reg.register_definition(_def())
        for p in reg.list_enabled():
            self.assertNotIn("datasourceId", p)

    def test_list_enabled_never_exposes_procedure_name(self):
        reg.register_definition(_def())
        for p in reg.list_enabled():
            self.assertNotIn("procedure", p)

    def test_register_definition_syncs_enabled_procedure_into_allowlist(self):
        reg.register_definition(_def(enabled=True, procedure="dbo.usp_Sync"))
        self.assertTrue(allowlist.is_procedure_allowed("usp_Sync"))

    def test_register_definition_disabled_does_not_sync_into_allowlist(self):
        reg.register_definition(_def(enabled=False, procedure="dbo.usp_NoSync"))
        self.assertFalse(allowlist.is_procedure_allowed("usp_NoSync"))

    def test_clear_removes_from_allowlist_too(self):
        reg.register_definition(_def(enabled=True, procedure="dbo.usp_ToRemove"))
        reg.clear()
        self.assertFalse(allowlist.is_procedure_allowed("usp_ToRemove"))

    def test_register_definition_rejects_missing_required_keys(self):
        with self.assertRaises(ValueError):
            reg.register_definition({"id": "incomplete"})


if __name__ == "__main__":
    unittest.main()
