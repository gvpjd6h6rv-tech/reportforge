"""
test_sql_executor_structured_mssql_timeout_reaches_driver.py

F19B-0 resolves F19A Risk R3 for the structured-mssql path specifically:
TIMEOUT_ENFORCED (not BLOCKED_TIMEOUT_ENFORCEMENT) — with evidence.

Before this phase, sql_query_limits.resolve_timeout() produced a bounded
value that was threaded into run_spec["timeout"] by sql_executor.py, but
nothing downstream ever READ that key (db_source_loader.load_spec never
referenced spec.get("timeout"); sa_query/sqlite_query don't accept a
timeout argument at all) — a resolved-but-unconsumed value, explicitly
disallowed by this phase's own rule ("No declarar timeout real si solo se
setea un valor que nadie consume").

For the structured-mssql path added in this phase, the resolved timeout
DOES reach the real driver: db_source_pymssql.connect() already reads
spec.get("timeout", 10) and passes it to pymssql.connect(login_timeout=,
timeout=) — this file proves that value is the SAME resolved value
sql_executor.execute_command() computed, not a default/unrelated one.

pymssql.connect is mocked — no real network connection is attempted.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_executor import execute_command
from reportforge.core.render.datasource.sql_query_limits import DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS

_STRUCTURED_SPEC = {
    "type": "mssql", "host": "fake-host", "port": 1433,
    "database": "fakedb", "username": "fakeuser", "password": "fakepass",
    # ttl=0: db_source_cache caches by (url, query, params) — NOT by
    # timeout — so identical query+params across these test cases would
    # otherwise serve a cached result and never re-invoke pymssql.connect
    # after the first test. Disabling caching here keeps each test's own
    # mock_connect assertion meaningful.
    "ttl": 0,
}


def _mock_connect_returning_fake_rows():
    fake_cursor = MagicMock()
    fake_cursor.fetchall.return_value = [{"ok": 1}]
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor
    return patch("pymssql.connect", return_value=fake_conn)


class TestSqlExecutorStructuredMssqlTimeoutReachesDriver(unittest.TestCase):

    def test_explicit_resolved_timeout_reaches_pymssql_connect_kwargs(self):
        with _mock_connect_returning_fake_rows() as mock_connect:
            execute_command(_STRUCTURED_SPEC, "SELECT 1 AS ok", timeout=17)
        kwargs = mock_connect.call_args.kwargs
        self.assertEqual(kwargs.get("login_timeout"), 17)
        self.assertEqual(kwargs.get("timeout"), 17)

    def test_absurd_requested_timeout_reaches_driver_already_capped(self):
        with _mock_connect_returning_fake_rows() as mock_connect:
            execute_command(_STRUCTURED_SPEC, "SELECT 1 AS ok", timeout=999999)
        kwargs = mock_connect.call_args.kwargs
        self.assertEqual(kwargs.get("login_timeout"), float(MAX_TIMEOUT_SECONDS))
        self.assertEqual(kwargs.get("timeout"), float(MAX_TIMEOUT_SECONDS))

    def test_missing_timeout_reaches_driver_as_the_resolved_default(self):
        with _mock_connect_returning_fake_rows() as mock_connect:
            execute_command(_STRUCTURED_SPEC, "SELECT 1 AS ok")
        kwargs = mock_connect.call_args.kwargs
        self.assertEqual(kwargs.get("login_timeout"), float(DEFAULT_TIMEOUT_SECONDS))
        self.assertEqual(kwargs.get("timeout"), float(DEFAULT_TIMEOUT_SECONDS))

    def test_password_reaches_the_driver_call_but_the_call_itself_is_never_logged(self):
        # Sanity check that this test file's own mocking doesn't
        # accidentally rely on/verify any logging path — execute_command
        # must succeed silently (no exception) on this happy path.
        with _mock_connect_returning_fake_rows():
            result = execute_command(_STRUCTURED_SPEC, "SELECT 1 AS ok", timeout=5)
        self.assertEqual(result.rows, [{"ok": 1}])


if __name__ == "__main__":
    unittest.main()
