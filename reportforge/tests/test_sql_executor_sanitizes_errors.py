"""
test_sql_executor_sanitizes_errors.py

Contract: execute_command() never lets a credential embedded in a
connection spec/URL escape into an exception message — verified via
sql_error_sanitizer, not a re-implementation of its logic here.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_executor import execute_command
from reportforge.core.render.datasource.db_source_errors import DbSourceError


class TestSqlExecutorSanitizesErrors(unittest.TestCase):

    def test_connection_failure_does_not_leak_password(self):
        spec = {"type": "mssql", "url": "mssql+pymssql://sa:MyS3cret@127.0.0.1:1/NoSuchDb"}
        try:
            execute_command(spec, "SELECT 1")
            self.fail("expected a connection failure")
        except DbSourceError as e:
            self.assertNotIn("MyS3cret", str(e))
        except Exception as e:
            # Some environments raise before wrapping into DbSourceError
            # (e.g. missing driver) — must still never leak.
            self.assertNotIn("MyS3cret", str(e))


if __name__ == "__main__":
    unittest.main()
