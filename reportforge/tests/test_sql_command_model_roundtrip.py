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
        original = SqlCommandModel(
            id="cmd-1",
            name="Ventas por fecha",
            sql="SELECT DocNum FROM OINV WHERE DocDate >= {?FechaDesde}",
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


if __name__ == "__main__":
    unittest.main()
