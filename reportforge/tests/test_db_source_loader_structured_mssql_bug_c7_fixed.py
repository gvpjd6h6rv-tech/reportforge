"""
test_db_source_loader_structured_mssql_bug_c7_fixed.py

Formalizes F19A Claim C7 as a regression test.

BEFORE F19B-0: a structured mssql spec (the {type, host, port, database,
username, password} shape persisted by connections_store.py / produced by
POST /datasources/{alias}/connect — the ONLY flow with real, persisted,
encrypted credentials) reached db_source_loader.load_spec() and ALWAYS
raised DbSourceError("db datasource requires 'url'") — before the safety
guard, before opening any connection. Every guarded execution path
(sql_executor.execute_command, db_source_registry.query_registered,
sql_schema_inspector.inspect_schema) was unusable against a real,
persisted datasource.

AFTER F19B-0: load_spec() recognizes this shape (via
db_source_spec_adapter.is_structured_mssql_spec) and routes it through
db_source_pymssql.query() instead — the SAME driver function already used
elsewhere in this codebase (invoice_queries.py, remision_queries.py) for
this exact spec shape. No SQLAlchemy 'url' is ever built or required for
this path.

No real network/production datasource is used here — pymssql.connect is
mocked (or, for one test, targets 127.0.0.1 on a closed local port, the
same local-only negative-path pattern already used by
test_sql_executor_sanitizes_errors.py).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.db_source_errors import DbSourceError
from reportforge.core.render.datasource.db_source_loader import load_spec

_SECRET = "S3cr3tPassw0rd!"


def _structured_spec(**overrides) -> dict:
    spec = {
        "type": "mssql", "host": "127.0.0.1", "port": 1,
        "database": "fakedb", "username": "fakeuser", "password": _SECRET,
        "query": "SELECT 1 AS ok",
    }
    spec.update(overrides)
    return spec


class TestDbSourceLoaderStructuredMssqlBugC7Fixed(unittest.TestCase):

    def test_no_longer_raises_the_old_requires_url_error(self):
        # 127.0.0.1:1 is a real, but always-closed, local port — a
        # connection attempt fails fast with a network/driver error, never
        # with the OLD C7 shape-mismatch error. Same local-only negative
        # path already used by test_sql_executor_sanitizes_errors.py.
        with self.assertRaises(DbSourceError) as ctx:
            load_spec(_structured_spec())
        self.assertNotIn("requires 'url'", str(ctx.exception))

    def test_connection_failure_never_leaks_the_password(self):
        with self.assertRaises(DbSourceError) as ctx:
            load_spec(_structured_spec())
        self.assertNotIn(_SECRET, str(ctx.exception))

    def test_error_message_uses_a_credential_free_display_label(self):
        with self.assertRaises(DbSourceError) as ctx:
            load_spec(_structured_spec())
        self.assertIn("mssql://127.0.0.1:1/fakedb", str(ctx.exception))

    def test_structured_spec_reaches_pymssql_query_on_the_happy_path(self):
        fake_cursor = MagicMock()
        fake_cursor.fetchall.return_value = [{"ok": 1}]
        fake_conn = MagicMock()
        fake_conn.cursor.return_value = fake_cursor
        with patch("pymssql.connect", return_value=fake_conn) as mock_connect:
            result = load_spec(_structured_spec())
        self.assertEqual(result, {"items": [{"ok": 1}]})
        self.assertTrue(mock_connect.called)
        # password reaches the real driver call (required to authenticate)
        # but never anywhere else — see the no-leak tests above/below.
        self.assertEqual(mock_connect.call_args.kwargs.get("password"), _SECRET)

    def test_url_shaped_spec_still_works_unchanged_no_regression(self):
        # A spec that already carries a 'url' must be completely
        # unaffected by this phase — routed through the pre-existing
        # sa_query/get_engine path exactly as before.
        with patch("reportforge.core.render.datasource.db_source_loader.sa_query") as mock_sa:
            mock_sa.return_value = [{"x": 1}]
            result = load_spec({"type": "mssql", "url": "mssql+pymssql://sa:x@host/db", "query": "SELECT 1"})
        self.assertEqual(result, {"items": [{"x": 1}]})
        mock_sa.assert_called_once()

    def test_sqlite_spec_still_works_unchanged_no_regression(self):
        result = load_spec({"type": "sqlite", "path": ":memory:", "query": "SELECT 1 AS x"})
        self.assertEqual(result, {"items": [{"x": 1}]})

    def test_mssql_type_without_host_or_url_raises_specific_dbsourceerror(self):
        # type == 'mssql' with neither 'host' nor 'url' is classified as
        # an (incomplete) structured attempt — it now raises a specific,
        # actionable DbSourceError ("missing required field: 'host'")
        # instead of the old generic "requires 'url'" message. Same
        # exception TYPE as before (DbSourceError, so every existing
        # caller that catches it specifically keeps working unchanged) —
        # deliberately a MORE informative message, not a preserved one.
        with self.assertRaises(DbSourceError) as ctx:
            load_spec({"type": "mssql", "query": "SELECT 1"})
        self.assertIn("host", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
