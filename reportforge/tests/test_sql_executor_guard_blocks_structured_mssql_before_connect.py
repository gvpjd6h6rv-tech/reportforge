"""
test_sql_executor_guard_blocks_structured_mssql_before_connect.py

Regression contract for F19B-0: routing a structured mssql spec through
db_source_pymssql.query() (new in this phase) must never bypass
sql_safety_guard. A destructive statement or a multi-statement payload
must be rejected BEFORE any connection is attempted — proven here by
asserting pymssql.connect is never called for either case, not merely by
asserting an exception was raised.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.db_source_errors import DbSourceError
from reportforge.core.render.datasource.sql_executor import execute_command

_STRUCTURED_SPEC = {
    "type": "mssql", "host": "fake-host", "port": 1433,
    "database": "fakedb", "username": "fakeuser", "password": "fakepass",
    "ttl": 0,
}


class TestSqlExecutorGuardBlocksStructuredMssqlBeforeConnect(unittest.TestCase):

    def test_destructive_statement_is_rejected_without_connecting(self):
        with patch("pymssql.connect") as mock_connect:
            with self.assertRaises(DbSourceError) as ctx:
                execute_command(_STRUCTURED_SPEC, "DROP TABLE OINV")
        self.assertIn("DROP", str(ctx.exception))
        mock_connect.assert_not_called()

    def test_multi_statement_is_rejected_without_connecting(self):
        with patch("pymssql.connect") as mock_connect:
            with self.assertRaises(DbSourceError) as ctx:
                execute_command(_STRUCTURED_SPEC, "SELECT 1; DROP TABLE OINV")
        self.assertIn("Multiple", str(ctx.exception))
        mock_connect.assert_not_called()

    def test_unallowlisted_exec_is_rejected_without_connecting(self):
        with patch("pymssql.connect") as mock_connect:
            with self.assertRaises(DbSourceError):
                execute_command(_STRUCTURED_SPEC, "EXEC sp_helpdb")
        mock_connect.assert_not_called()

    def test_safe_select_is_allowed_through_to_the_driver(self):
        from unittest.mock import MagicMock
        fake_cursor = MagicMock()
        fake_cursor.fetchall.return_value = [{"x": 1}]
        fake_conn = MagicMock()
        fake_conn.cursor.return_value = fake_cursor
        with patch("pymssql.connect", return_value=fake_conn) as mock_connect:
            result = execute_command(_STRUCTURED_SPEC, "SELECT 1 AS x")
        mock_connect.assert_called_once()
        self.assertEqual(result.rows, [{"x": 1}])


if __name__ == "__main__":
    unittest.main()
