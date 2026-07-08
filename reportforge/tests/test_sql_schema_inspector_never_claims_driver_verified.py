"""
test_sql_schema_inspector_never_claims_driver_verified.py

Contract (explicit requirement): no warning or output produced by this
module ever claims driver-verified schema — every uncertain-type message
must read as inference/fallback, not verification.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_schema_inspector import inspect_schema


class TestSqlSchemaInspectorNeverClaimsDriverVerified(unittest.TestCase):

    def test_no_rows_warning_does_not_claim_driver_verified(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = inspect_schema(spec, "SELECT 1 AS x WHERE 0")
        for w in result.warnings:
            self.assertNotIn("driver schema verified", w.lower())

    def test_all_null_column_warning_does_not_claim_driver_verified(self):
        db_path = tempfile.mktemp(suffix=".db")
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE t (a INT)")
        conn.execute("INSERT INTO t VALUES (NULL)")
        conn.commit()
        conn.close()
        try:
            spec = {"type": "sqlite", "path": db_path}
            result = inspect_schema(spec, "SELECT a FROM t")
            for w in result.warnings:
                self.assertNotIn("driver schema verified", w.lower())
        finally:
            os.remove(db_path)


if __name__ == "__main__":
    unittest.main()
