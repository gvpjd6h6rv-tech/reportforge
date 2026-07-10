"""
test_stored_procedure_executor.py

Contract: execute_stored_procedure(proc_id, params) is the ONLY entry
point — it accepts an ID and a params dict, never a procedure name or SQL
text, and blocks unknown/disabled/invalid-param/non-MSSQL-datasource
cases BEFORE ever calling sql_executor.execute_command (no connection
attempted for a blocked case).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource import db_source_registry as ds_reg
from reportforge.core.render.datasource import stored_procedure_registry as reg
from reportforge.core.render.datasource.stored_procedure_executor import (
    StoredProcedureBlockedError,
    execute_stored_procedure,
)

_MSSQL_SPEC = {"type": "mssql", "host": "h", "port": 1433, "database": "d", "username": "u", "password": "p"}
_SQLITE_SPEC = {"type": "sqlite", "path": ":memory:"}


def _def(**overrides):
    base = {
        "id": "demo", "label": "Demo", "datasourceId": "ds1", "procedure": "dbo.usp_Demo",
        "enabled": True, "readOnly": True, "timeoutSeconds": 10, "maxRows": 100,
        "params": [{"name": "CardCode", "type": "string", "required": True, "maxLength": 30}],
    }
    base.update(overrides)
    return base


def _mock_pymssql_success(rows):
    fake_cursor = MagicMock()
    fake_cursor.fetchall.return_value = rows
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor
    return patch("pymssql.connect", return_value=fake_conn)


class TestStoredProcedureExecutor(unittest.TestCase):

    def setUp(self):
        reg.clear()
        ds_reg._REGISTRY.clear()

    def tearDown(self):
        reg.clear()
        ds_reg._REGISTRY.clear()

    def test_executes_allowlisted_with_params(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with _mock_pymssql_success([{"Name": "Acme"}]):
            definition, result = execute_stored_procedure("demo", {"CardCode": "C001"})
        self.assertEqual(definition["id"], "demo")
        self.assertEqual(result.row_count, 1)

    def test_unknown_id_is_blocked_without_connecting(self):
        with patch("pymssql.connect") as mock_connect:
            with self.assertRaises(StoredProcedureBlockedError):
                execute_stored_procedure("nope", {})
            mock_connect.assert_not_called()

    def test_disabled_id_is_blocked_without_connecting(self):
        reg.register_definition(_def(enabled=False))
        ds_reg.register("ds1", _MSSQL_SPEC)
        with patch("pymssql.connect") as mock_connect:
            with self.assertRaises(StoredProcedureBlockedError):
                execute_stored_procedure("demo", {"CardCode": "C001"})
            mock_connect.assert_not_called()

    def test_extra_param_is_blocked_without_connecting(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with patch("pymssql.connect") as mock_connect:
            with self.assertRaises(StoredProcedureBlockedError):
                execute_stored_procedure("demo", {"CardCode": "C001", "evil": "x"})
            mock_connect.assert_not_called()

    def test_missing_required_param_is_blocked_without_connecting(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with patch("pymssql.connect") as mock_connect:
            with self.assertRaises(StoredProcedureBlockedError):
                execute_stored_procedure("demo", {})
            mock_connect.assert_not_called()

    def test_datasource_outside_mssql_contract_is_blocked(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _SQLITE_SPEC)
        with self.assertRaises(StoredProcedureBlockedError):
            execute_stored_procedure("demo", {"CardCode": "C001"})

    def test_unregistered_datasource_is_blocked(self):
        reg.register_definition(_def(datasourceId="ghost"))
        with self.assertRaises(StoredProcedureBlockedError):
            execute_stored_procedure("demo", {"CardCode": "C001"})

    def test_applies_definition_timeout_and_max_rows(self):
        reg.register_definition(_def(timeoutSeconds=7, maxRows=3))
        ds_reg.register("ds1", _MSSQL_SPEC)
        with _mock_pymssql_success([{"x": 1}] * 10), \
             patch("reportforge.core.render.datasource.stored_procedure_executor.execute_command") as mock_exec:
            mock_exec.return_value = MagicMock(row_count=3, rows=[], columns=[], warnings=[])
            execute_stored_procedure("demo", {"CardCode": "C001"})
        kwargs = mock_exec.call_args.kwargs
        self.assertEqual(kwargs["timeout"], 7)
        self.assertEqual(kwargs["max_rows"], 3)

    def test_bind_values_passed_as_params_not_concatenated_into_sql(self):
        reg.register_definition(_def())
        ds_reg.register("ds1", _MSSQL_SPEC)
        with patch("reportforge.core.render.datasource.stored_procedure_executor.execute_command") as mock_exec:
            mock_exec.return_value = MagicMock(row_count=0, rows=[], columns=[], warnings=[])
            execute_stored_procedure("demo", {"CardCode": "'; DROP TABLE OINV; --"})
        sql_arg = mock_exec.call_args.args[1]
        params_arg = mock_exec.call_args.kwargs["parameters"]
        self.assertNotIn("DROP TABLE", sql_arg)
        self.assertEqual(params_arg["CardCode"], "'; DROP TABLE OINV; --")

    def test_dangerous_registered_identifier_is_blocked(self):
        # Defense in depth: even if something malformed slipped into the
        # registry (shape-only validated), the executor re-validates the
        # identifier via stored_procedure_catalog before ever building SQL.
        reg.register_definition(_def(procedure="dbo.usp_Demo; DROP TABLE OINV --"))
        ds_reg.register("ds1", _MSSQL_SPEC)
        with patch("pymssql.connect") as mock_connect:
            with self.assertRaises(StoredProcedureBlockedError):
                execute_stored_procedure("demo", {"CardCode": "C001"})
            mock_connect.assert_not_called()

    def test_execute_stored_procedure_only_accepts_an_id_string(self):
        # Structural contract: the function signature itself has no
        # parameter for a raw procedure name or SQL — passing an
        # arbitrary string as proc_id that isn't a registered ID is
        # always treated as an (unknown) ID lookup, never as SQL/name.
        with self.assertRaises(StoredProcedureBlockedError):
            execute_stored_procedure("EXEC sp_helpdb", {})


if __name__ == "__main__":
    unittest.main()
