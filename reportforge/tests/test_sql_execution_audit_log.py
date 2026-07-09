"""
test_sql_execution_audit_log.py

Contract: sql_execution_audit_log.record() — see the module's own
docstring for the full contract. This file verifies:
  - the minimum required schema (F19B-1A brief) is always present
  - no field for password/connection-string/username/full-SQL/raw
    parameter values exists in the entry shape at all (structural check)
  - safe_error is sanitized a second time (defense in depth) before
    being stored, even if a caller passes something unsanitized
  - sql_fingerprint never reveals the underlying SQL text
  - user_context defaults to the literal "unknown", never fabricated
  - invalid status is rejected fail-closed
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource import sql_execution_audit_log as audit

_SECRET = "S3cr3tPassw0rd!"


class TestSqlExecutionAuditLog(unittest.TestCase):

    def setUp(self):
        audit.clear()

    def test_record_contains_the_minimum_required_fields(self):
        entry = audit.record(
            datasource_alias="sap_prod", command_id="VentasPorFecha",
            statement_kind="SELECT", status="success", confirmation_present=True,
            max_rows_effective=1000, timeout_effective=30.0, duration_ms=42.5,
            row_count=7, sql_fingerprint_value=audit.sql_fingerprint("SELECT 1"),
        )
        required_keys = {
            "timestamp", "datasource_alias", "command_id", "operation_type",
            "statement_kind", "max_rows_effective", "timeout_effective",
            "status", "duration_ms", "row_count", "safe_error",
            "confirmation_present", "sql_fingerprint", "user_context",
        }
        self.assertEqual(required_keys, set(entry.keys()))
        self.assertEqual(entry["operation_type"], "sql_command")

    def test_no_field_exists_for_password_connection_string_username_or_sql(self):
        entry = audit.record(
            datasource_alias="sap_prod", command_id="c1", statement_kind="SELECT",
            status="success", confirmation_present=True,
        )
        forbidden_keys = {"password", "connection_string", "url", "username", "sql", "parameters", "parameter_values"}
        self.assertEqual(forbidden_keys & set(entry.keys()), set())

    def test_invalid_status_is_rejected(self):
        with self.assertRaises(ValueError):
            audit.record(
                datasource_alias="a", command_id="c", statement_kind="SELECT",
                status="not_a_real_status", confirmation_present=True,
            )

    def test_user_context_defaults_to_unknown_when_absent(self):
        entry = audit.record(
            datasource_alias="a", command_id="c", statement_kind="SELECT",
            status="success", confirmation_present=True,
        )
        self.assertEqual(entry["user_context"], "unknown")

    def test_user_context_is_preserved_when_supplied(self):
        entry = audit.record(
            datasource_alias="a", command_id="c", statement_kind="SELECT",
            status="success", confirmation_present=True, user_context="system",
        )
        self.assertEqual(entry["user_context"], "system")

    # --- no-secret-leak (defense in depth) -----------------------------------------------------

    def test_safe_error_is_sanitized_a_second_time_even_if_caller_forgot(self):
        unsanitized = f"Query failed [mssql+pymssql://sa:{_SECRET}@host/db]: connection refused"
        entry = audit.record(
            datasource_alias="a", command_id="c", statement_kind="SELECT",
            status="error", confirmation_present=True, safe_error=unsanitized,
        )
        self.assertNotIn(_SECRET, entry["safe_error"])

    def test_safe_error_kv_style_password_is_sanitized(self):
        unsanitized = f"connection failed: Password={_SECRET};User Id=sa"
        entry = audit.record(
            datasource_alias="a", command_id="c", statement_kind="SELECT",
            status="error", confirmation_present=True, safe_error=unsanitized,
        )
        self.assertNotIn(_SECRET, entry["safe_error"])

    def test_no_safe_error_is_none_not_empty_string(self):
        entry = audit.record(
            datasource_alias="a", command_id="c", statement_kind="SELECT",
            status="success", confirmation_present=True,
        )
        self.assertIsNone(entry["safe_error"])

    # --- fingerprint -----------------------------------------------------

    def test_fingerprint_is_deterministic(self):
        f1 = audit.sql_fingerprint("SELECT DocNum FROM OINV WHERE CardCode = :Code")
        f2 = audit.sql_fingerprint("SELECT DocNum FROM OINV WHERE CardCode = :Code")
        self.assertEqual(f1, f2)

    def test_fingerprint_differs_for_different_sql(self):
        f1 = audit.sql_fingerprint("SELECT 1")
        f2 = audit.sql_fingerprint("SELECT 2")
        self.assertNotEqual(f1, f2)

    def test_fingerprint_never_contains_the_original_sql_text(self):
        sql = "SELECT CardCode, Password FROM SensitiveConfigTable"
        fp = audit.sql_fingerprint(sql)
        self.assertNotIn("Password", fp)
        self.assertNotIn("SensitiveConfigTable", fp)
        self.assertEqual(len(fp), 16)

    def test_fingerprint_of_empty_or_none_sql_does_not_raise(self):
        self.assertIsInstance(audit.sql_fingerprint(None), str)
        self.assertIsInstance(audit.sql_fingerprint(""), str)

    # --- storage -----------------------------------------------------

    def test_recent_returns_recorded_entries_in_order(self):
        audit.record(datasource_alias="a", command_id="c1", statement_kind="SELECT", status="success", confirmation_present=True)
        audit.record(datasource_alias="a", command_id="c2", statement_kind="SELECT", status="blocked", confirmation_present=False)
        entries = audit.recent(10)
        self.assertEqual([e["command_id"] for e in entries], ["c1", "c2"])

    def test_clear_empties_the_log(self):
        audit.record(datasource_alias="a", command_id="c1", statement_kind="SELECT", status="success", confirmation_present=True)
        audit.clear()
        self.assertEqual(audit.recent(10), [])


if __name__ == "__main__":
    unittest.main()
