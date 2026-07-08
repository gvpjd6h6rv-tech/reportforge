"""
test_sql_safety_guard.py

SECURITY PATCH 0 — backend tests for the read-only SQL admission chain:
  sql_safety_guard.py        — classifies a statement, permits SELECT/WITH,
                                blocks DML/DDL, delegates EXEC-target and
                                dangerous-construct decisions
  sql_procedure_allowlist.py — EXEC target allow/deny, xp_*/sp_* hard-block,
                                OPENROWSET/OPENDATASOURCE hard-block
  sql_error_sanitizer.py     — redacts credentials from error/log text
  sql_query_limits.py        — resolves timeout/max_rows, rejects absurd values

Each test name is its own single-assertion contract.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.sql_safety_guard import check
from reportforge.core.render.datasource import sql_procedure_allowlist as allowlist
from reportforge.core.render.datasource.sql_error_sanitizer import sanitize, sanitize_exception
from reportforge.core.render.datasource.sql_query_limits import (
    resolve_max_rows,
    resolve_timeout,
    truncate_rows,
    DEFAULT_MAX_ROWS,
    DEFAULT_TIMEOUT_SECONDS,
    MAX_MAX_ROWS,
    MAX_TIMEOUT_SECONDS,
)


# ── sql_safety_guard: allow ──────────────────────────────────────────────────

class TestSqlGuardAllows(unittest.TestCase):

    def test_sql_guard_allows_select(self):
        verdict = check("SELECT TOP 10 CardCode, CardName FROM OCRD")
        self.assertTrue(verdict["allowed"])
        self.assertEqual(verdict["kind"], "SELECT")

    def test_sql_guard_allows_select_with_cte(self):
        verdict = check("WITH cte AS (SELECT 1 AS x) SELECT * FROM cte")
        self.assertTrue(verdict["allowed"])

    def test_sql_guard_allows_select_with_leading_comment(self):
        verdict = check("-- fetch top customers\nSELECT * FROM OCRD")
        self.assertTrue(verdict["allowed"])


# ── sql_safety_guard: blocks DML/DDL ──────────────────────────────────────────

class TestSqlGuardBlocksDmlDdl(unittest.TestCase):

    def test_sql_guard_blocks_insert(self):
        verdict = check("INSERT INTO OINV (DocNum) VALUES (1)")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:INSERT")

    def test_sql_guard_blocks_update(self):
        verdict = check("UPDATE OINV SET DocTotal = 0")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:UPDATE")

    def test_sql_guard_blocks_delete(self):
        verdict = check("DELETE FROM OINV WHERE DocNum = 1")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:DELETE")

    def test_sql_guard_blocks_drop(self):
        verdict = check("DROP TABLE OINV")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:DROP")

    def test_sql_guard_blocks_alter(self):
        verdict = check("ALTER TABLE OINV ADD Foo INT")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:ALTER")

    def test_sql_guard_blocks_truncate(self):
        verdict = check("TRUNCATE TABLE OINV")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:TRUNCATE")

    def test_sql_guard_blocks_merge(self):
        verdict = check("MERGE INTO x USING y ON x.a = y.a WHEN MATCHED THEN UPDATE SET x.a = y.a")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:MERGE")

    def test_sql_guard_blocks_create(self):
        verdict = check("CREATE TABLE Foo (a INT)")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:CREATE")

    def test_sql_guard_blocks_grant(self):
        verdict = check("GRANT SELECT ON OINV TO public")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:GRANT")


# ── sql_safety_guard: blocks EXEC / adversarial shapes ────────────────────────

class TestSqlGuardBlocksExecAndAdversarial(unittest.TestCase):

    def setUp(self):
        allowlist.clear_allowlist()

    def test_sql_guard_blocks_xp_exec(self):
        verdict = check("EXEC xp_cmdshell 'dir'")
        self.assertFalse(verdict["allowed"])

    def test_sql_guard_blocks_unknown_exec(self):
        # Not on the allowlist -> deny by default, even though it's a
        # plain, non-system procedure name.
        verdict = check("EXEC SomeRandomProc @x=1")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:UNKNOWN_EXEC")

    def test_sql_guard_blocks_multiple_statements(self):
        verdict = check("SELECT 1; DROP TABLE OINV")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "MULTI_STATEMENT")

    def test_sql_guard_blocks_openrowset_inside_select(self):
        verdict = check("SELECT * FROM OPENROWSET('SQLNCLI', 'server=x', 'SELECT 1')")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:DANGEROUS_CONSTRUCT")

    def test_sql_guard_blocks_opendatasource_inside_select(self):
        verdict = check("SELECT * FROM OPENDATASOURCE('SQLNCLI', 'server=x').db.dbo.t")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "BLOCKED:DANGEROUS_CONSTRUCT")

    def test_sql_guard_blocks_empty_command(self):
        verdict = check("   ")
        self.assertFalse(verdict["allowed"])
        self.assertEqual(verdict["kind"], "EMPTY")

    def test_sql_guard_reason_never_echoes_full_statement(self):
        secret_looking_sql = "DELETE FROM Users WHERE password = 'super-secret-value'"
        verdict = check(secret_looking_sql)
        self.assertNotIn("super-secret-value", verdict["reason"])


# ── sql_procedure_allowlist ───────────────────────────────────────────────────

class TestProcedureAllowlist(unittest.TestCase):

    def setUp(self):
        allowlist.clear_allowlist()

    def test_procedure_allowlist_allows_registered_proc(self):
        allowlist.add_to_allowlist("MiReporteVentas")
        verdict = check("EXEC MiReporteVentas @FechaDesde=?, @FechaHasta=?")
        self.assertTrue(verdict["allowed"])
        self.assertEqual(verdict["kind"], "EXEC")

    def test_procedure_allowlist_denies_by_default(self):
        self.assertFalse(allowlist.is_procedure_allowed("MiReporteVentas"))

    def test_procedure_allowlist_hard_blocks_xp_even_if_added(self):
        allowlist.add_to_allowlist("xp_cmdshell")
        self.assertFalse(allowlist.is_procedure_allowed("xp_cmdshell"))

    def test_procedure_allowlist_hard_blocks_sp_configure_even_if_added(self):
        allowlist.add_to_allowlist("sp_configure")
        self.assertFalse(allowlist.is_procedure_allowed("sp_configure"))

    def test_procedure_allowlist_detects_openrowset_anywhere(self):
        self.assertTrue(allowlist.is_dangerous_construct("SELECT * FROM OPENROWSET(...)"))

    def test_procedure_allowlist_detects_opendatasource_anywhere(self):
        self.assertTrue(allowlist.is_dangerous_construct("SELECT * FROM OPENDATASOURCE(...)"))

    def test_procedure_allowlist_ignores_plain_select(self):
        self.assertFalse(allowlist.is_dangerous_construct("SELECT * FROM OCRD"))


# ── sql_error_sanitizer ───────────────────────────────────────────────────────

class TestErrorSanitizer(unittest.TestCase):

    def test_error_sanitizer_redacts_url_password(self):
        raw = "Query failed [mssql+pymssql://sa:MyS3cret@10.0.0.5:1433/SBODEMO]: login failed"
        clean = sanitize(raw)
        self.assertNotIn("MyS3cret", clean)
        self.assertIn("10.0.0.5", clean)  # host/port kept — useful diagnostic, not a secret

    def test_error_sanitizer_redacts_password_query_param(self):
        raw = "Connection error: Password=abc123; Server=host; Database=db"
        clean = sanitize(raw)
        self.assertNotIn("abc123", clean)

    def test_error_sanitizer_redacts_pwd_alias(self):
        clean = sanitize("Connection error: pwd=abc123;server=host")
        self.assertNotIn("abc123", clean)

    def test_error_sanitizer_caps_message_length(self):
        clean = sanitize("x" * 2000)
        self.assertLess(len(clean), 600)

    def test_error_sanitizer_handles_exception_object(self):
        clean = sanitize_exception(RuntimeError("mssql+pymssql://sa:MyS3cret@host/db failed"))
        self.assertNotIn("MyS3cret", clean)


# ── sql_query_limits ──────────────────────────────────────────────────────────

class TestQueryLimits(unittest.TestCase):

    def test_timeout_required_defaults_when_missing(self):
        self.assertEqual(resolve_timeout(None), float(DEFAULT_TIMEOUT_SECONDS))

    def test_timeout_required_rejects_zero_and_negative(self):
        self.assertEqual(resolve_timeout(0), float(DEFAULT_TIMEOUT_SECONDS))
        self.assertEqual(resolve_timeout(-5), float(DEFAULT_TIMEOUT_SECONDS))

    def test_timeout_required_caps_absurd_value(self):
        self.assertEqual(resolve_timeout(999999), float(MAX_TIMEOUT_SECONDS))

    def test_max_rows_required_defaults_when_missing(self):
        self.assertEqual(resolve_max_rows(None), DEFAULT_MAX_ROWS)

    def test_max_rows_required_rejects_zero_and_negative(self):
        self.assertEqual(resolve_max_rows(0), DEFAULT_MAX_ROWS)
        self.assertEqual(resolve_max_rows(-1), DEFAULT_MAX_ROWS)

    def test_max_rows_required_caps_absurd_value(self):
        self.assertEqual(resolve_max_rows(10_000_000), MAX_MAX_ROWS)

    def test_truncate_rows_applies_cap(self):
        rows = [{"n": i} for i in range(10)]
        self.assertEqual(len(truncate_rows(rows, 3)), 3)


# ── Wired into the real chokepoint (db_source_registry.query_registered) ────

class TestGuardWiredIntoRegistry(unittest.TestCase):

    def setUp(self):
        from reportforge.core.render.datasource import db_source_registry as reg
        reg._REGISTRY.clear()
        reg.register("guard_test_ds", {"type": "sqlite", "url": "sqlite:///:memory:"})

    def test_datasource_query_endpoint_blocks_destructive_sql(self):
        from reportforge.core.render.datasource.db_source_registry import query_registered
        from reportforge.core.render.datasource.db_source_errors import DbSourceError
        with self.assertRaises(DbSourceError):
            query_registered("guard_test_ds", query="DROP TABLE foo")

    def test_existing_safe_select_still_works(self):
        from reportforge.core.render.datasource.db_source_registry import query_registered
        rows = query_registered("guard_test_ds", query="SELECT 1 AS x")
        self.assertEqual(rows, [{"x": 1}])

    def test_datasource_query_endpoint_returns_sanitized_error(self):
        from reportforge.core.render.datasource.db_source_registry import query_registered
        from reportforge.core.render.datasource.db_source_errors import DbSourceError
        # A real (bogus) mssql URL with embedded credentials that will fail
        # to connect — the resulting error must never surface the password.
        from reportforge.core.render.datasource import db_source_registry as reg
        reg.register("guard_bad_conn_ds", {
            "type": "mssql",
            "url": "mssql+pymssql://sa:MyS3cret@127.0.0.1:1/NoSuchDb",
        })
        try:
            query_registered("guard_bad_conn_ds", query="SELECT 1")
            self.fail("expected a connection failure")
        except DbSourceError as e:
            self.assertNotIn("MyS3cret", str(e))
        except Exception as e:
            # Some environments raise a raw driver exception before it
            # reaches DbSourceError's wrapping — still must not leak.
            self.assertNotIn("MyS3cret", str(e))


if __name__ == "__main__":
    unittest.main()
