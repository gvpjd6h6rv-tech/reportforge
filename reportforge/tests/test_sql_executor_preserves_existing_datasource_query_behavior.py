"""
test_sql_executor_preserves_existing_datasource_query_behavior.py

Contract: sql_executor.execute_command() is a NEW, additional contract —
it does not change or replace db_source_registry.query_registered (the
existing HTTP route's entry point). For an equivalent spec+query, both
produce the same rows, proving the new executor didn't silently diverge
from or duplicate-with-different-behavior the already-shipped path.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_executor import execute_command
from reportforge.core.render.datasource import db_source_registry as reg


class TestSqlExecutorPreservesExistingDatasourceQueryBehavior(unittest.TestCase):

    def setUp(self):
        reg._REGISTRY.clear()

    def test_equivalent_spec_and_query_produce_the_same_rows_as_query_registered(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        reg.register("parity_test_ds", spec)

        via_registry = reg.query_registered("parity_test_ds", query="SELECT 1 AS x")
        via_executor = execute_command(spec, "SELECT 1 AS x")

        self.assertEqual(via_executor.rows, via_registry)

    def test_both_paths_block_the_same_destructive_statement(self):
        from reportforge.core.render.datasource.db_source_errors import DbSourceError
        spec = {"type": "sqlite", "path": ":memory:"}
        reg.register("parity_test_ds2", spec)

        with self.assertRaises(DbSourceError):
            reg.query_registered("parity_test_ds2", query="DROP TABLE foo")
        with self.assertRaises(DbSourceError):
            execute_command(spec, "DROP TABLE foo")


if __name__ == "__main__":
    unittest.main()
