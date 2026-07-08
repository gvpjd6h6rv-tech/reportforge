"""
test_sql_command_model_roundtrip.py

Contract: SqlCommandModel.to_dict() / .from_dict() are exact inverses, and
defaults apply when optional fields are absent from the input dict.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_command_model import SqlCommandModel


class TestSqlCommandModelRoundtrip(unittest.TestCase):

    def test_roundtrip_preserves_all_fields(self):
        # .sql is already-prepared (bind marker :FechaDesde), not raw
        # Crystal-style {?FechaDesde} — see RF-SQL-COMMAND-MODEL-SQL-FORMAT-1.
        original = SqlCommandModel(
            id="cmd-1",
            name="Ventas por fecha",
            sql="SELECT DocNum FROM OINV WHERE DocDate >= :FechaDesde",
            command_type="query",
            parameters=[{"name": "FechaDesde", "type": "date"}],
            result_schema=[{"name": "DocNum", "db_type": "int", "rf_type": "number", "nullable": False, "ordinal": 0}],
            max_rows_preview=50,
        )
        restored = SqlCommandModel.from_dict(original.to_dict())
        self.assertEqual(restored, original)

    def test_from_dict_applies_defaults_for_missing_optional_fields(self):
        restored = SqlCommandModel.from_dict({"id": "cmd-2", "name": "Simple", "sql": "SELECT 1"})
        self.assertEqual(restored.command_type, "query")
        self.assertEqual(restored.parameters, [])
        self.assertEqual(restored.result_schema, [])
        self.assertEqual(restored.max_rows_preview, 100)

    def test_stored_procedure_command_type_roundtrips(self):
        original = SqlCommandModel(id="cmd-3", name="Reporte", sql="EXEC MiReporteVentas", command_type="stored_procedure")
        restored = SqlCommandModel.from_dict(original.to_dict())
        self.assertEqual(restored.command_type, "stored_procedure")

    def test_to_dict_does_not_share_list_references(self):
        original = SqlCommandModel(id="cmd-4", name="X", sql="SELECT 1", parameters=[{"name": "a"}])
        d = original.to_dict()
        d["parameters"].append({"name": "b"})
        self.assertEqual(len(original.parameters), 1)

    def test_datasource_alias_roundtrips_when_present(self):
        # UDS 4.1 Fase 17A (BLOCK-F17-1 resolution).
        original = SqlCommandModel(id="cmd-5", name="X", sql="SELECT 1", datasource_alias="myds")
        restored = SqlCommandModel.from_dict(original.to_dict())
        self.assertEqual(restored.datasource_alias, "myds")

    def test_datasource_alias_defaults_to_none_for_old_commands_without_it(self):
        # An old command saved before Fase 17A never had this key — must
        # not break, must not fabricate a value.
        restored = SqlCommandModel.from_dict({"id": "cmd-6", "name": "Old", "sql": "SELECT 1"})
        self.assertIsNone(restored.datasource_alias)

    def test_to_dict_always_includes_datasource_alias_key_even_when_none(self):
        original = SqlCommandModel(id="cmd-7", name="X", sql="SELECT 1")
        self.assertIn("datasource_alias", original.to_dict())
        self.assertIsNone(original.to_dict()["datasource_alias"])


if __name__ == "__main__":
    unittest.main()
