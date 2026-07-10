"""
test_stored_procedure_audit_log.py

Contract: stored_procedure_audit_log.record() accepts exactly the F19C
SP-specific fields — procedure logical id, sql procedure name,
datasource id, param NAMES (never values), status, row count, timeout,
duration, blocked reason — and has no field a caller could use to leak a
param VALUE, password, or connection string.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource import stored_procedure_audit_log as audit


class TestStoredProcedureAuditLog(unittest.TestCase):

    def setUp(self):
        audit.clear()

    def tearDown(self):
        audit.clear()

    def test_records_success(self):
        audit.record(
            procedure_logical_id="demo", procedure_sql_name="dbo.usp_Demo",
            datasource_id="ds1", status="success", param_names=["CardCode"], row_count=1,
        )
        entry = audit.recent(1)[0]
        self.assertEqual(entry["status"], "success")
        self.assertEqual(entry["procedure_logical_id"], "demo")
        self.assertEqual(entry["row_count"], 1)

    def test_records_blocked_with_reason(self):
        audit.record(
            procedure_logical_id="demo", procedure_sql_name=None,
            datasource_id=None, status="blocked", blocked_reason="Unknown storedProcedureId: 'demo'",
        )
        entry = audit.recent(1)[0]
        self.assertEqual(entry["status"], "blocked")
        self.assertIn("Unknown", entry["blocked_reason"])

    def test_records_error_with_safe_error(self):
        audit.record(
            procedure_logical_id="demo", procedure_sql_name="dbo.usp_Demo",
            datasource_id="ds1", status="error", safe_error="connection refused",
        )
        entry = audit.recent(1)[0]
        self.assertEqual(entry["status"], "error")
        self.assertEqual(entry["safe_error"], "connection refused")

    def test_param_names_are_recorded_never_values(self):
        audit.record(
            procedure_logical_id="demo", procedure_sql_name="dbo.usp_Demo",
            datasource_id="ds1", status="success", param_names=["CardCode", "Limit"],
        )
        entry = audit.recent(1)[0]
        self.assertEqual(entry["param_names"], ["CardCode", "Limit"])
        # structural: record() has no kwarg for values at all
        self.assertNotIn("param_values", entry)
        self.assertNotIn("params", entry)

    def test_invalid_status_raises(self):
        with self.assertRaises(ValueError):
            audit.record(
                procedure_logical_id="demo", procedure_sql_name="dbo.usp_Demo",
                datasource_id="ds1", status="not-a-real-status",
            )

    def test_user_context_defaults_to_unknown_never_blank(self):
        audit.record(
            procedure_logical_id="demo", procedure_sql_name="dbo.usp_Demo",
            datasource_id="ds1", status="success",
        )
        entry = audit.recent(1)[0]
        self.assertEqual(entry["user_context"], "unknown")


if __name__ == "__main__":
    unittest.main()
