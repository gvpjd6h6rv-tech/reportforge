"""
test_sql_schema_inspector_error.py

Contract: inspect_schema() never swallows an execution error and never
lets a credential leak through it — it delegates entirely to
sql_executor, so a blocked/failed command surfaces the SAME sanitized
DbSourceError sql_executor already raises, not a new or different error.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.db_source_errors import DbSourceError
from reportforge.core.render.datasource.sql_schema_inspector import inspect_schema


class TestSqlSchemaInspectorError(unittest.TestCase):

    def test_destructive_sql_is_rejected_not_silently_ignored(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        with self.assertRaises(DbSourceError):
            inspect_schema(spec, "DROP TABLE foo")

    def test_connection_failure_does_not_leak_credentials(self):
        spec = {"type": "mssql", "url": "mssql+pymssql://sa:MyS3cret@127.0.0.1:1/NoSuchDb"}
        try:
            inspect_schema(spec, "SELECT 1")
            self.fail("expected a connection failure")
        except Exception as e:
            self.assertNotIn("MyS3cret", str(e))


if __name__ == "__main__":
    unittest.main()
