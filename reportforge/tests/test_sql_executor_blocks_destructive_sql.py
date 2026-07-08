"""
test_sql_executor_blocks_destructive_sql.py

Contract: execute_command() calls sql_safety_guard.check() BEFORE running
anything — a destructive statement never reaches the database driver.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_executor import execute_command
from reportforge.core.render.datasource.db_source_errors import DbSourceError


class TestSqlExecutorBlocksDestructiveSql(unittest.TestCase):

    def test_drop_table_is_rejected(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        with self.assertRaises(DbSourceError):
            execute_command(spec, "DROP TABLE foo")

    def test_delete_is_rejected(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        with self.assertRaises(DbSourceError):
            execute_command(spec, "DELETE FROM foo")

    def test_rejected_statement_never_reaches_the_driver(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        from unittest.mock import patch
        with patch("reportforge.core.render.datasource.sql_executor.load_spec") as mock_load:
            try:
                execute_command(spec, "DROP TABLE foo")
            except DbSourceError:
                pass
            mock_load.assert_not_called()


if __name__ == "__main__":
    unittest.main()
