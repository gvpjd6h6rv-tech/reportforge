"""
test_db_source_spec_adapter.py

Contract: db_source_spec_adapter.to_executable_spec()/is_structured_mssql_spec()/
safe_display_target() — see db_source_spec_adapter.py's own docstring for the
full contract. This file verifies:
  - a valid structured mssql spec is recognized and normalized
  - each required field's absence is rejected fail-closed, by name
  - port defaults sanely
  - specs this module does NOT own (url-shaped, sqlite, other engines) are
    passed through unchanged — never guessed at, never mutated
  - no credential VALUE ever appears in a raised error message
  - the module performs no I/O (no print/logging) — static source check
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.db_source_spec_adapter import (
    is_structured_mssql_spec,
    safe_display_target,
    to_executable_spec,
)

_SECRET = "S3cr3tPassw0rd!"


def _valid_spec(**overrides) -> dict:
    spec = {
        "type": "mssql",
        "host": "sqlserver.internal",
        "port": 1433,
        "database": "SBODemoDB",
        "username": "sa",
        "password": _SECRET,
    }
    spec.update(overrides)
    return spec


class TestDbSourceSpecAdapter(unittest.TestCase):

    # --- recognition -----------------------------------------------------

    def test_recognizes_structured_mssql_spec(self):
        self.assertTrue(is_structured_mssql_spec(_valid_spec()))

    def test_does_not_recognize_url_shaped_spec(self):
        spec = {"type": "mssql", "url": "mssql+pymssql://sa:x@host/db"}
        self.assertFalse(is_structured_mssql_spec(spec))

    def test_does_not_recognize_sqlite_spec(self):
        self.assertFalse(is_structured_mssql_spec({"type": "sqlite", "path": ":memory:"}))

    def test_does_not_recognize_unsupported_engine_type(self):
        spec = _valid_spec(type="postgresql")
        self.assertFalse(is_structured_mssql_spec(spec))

    def test_type_match_is_case_insensitive(self):
        self.assertTrue(is_structured_mssql_spec(_valid_spec(type="MSSQL")))

    # --- normalization -----------------------------------------------------

    def test_accepts_valid_spec_and_produces_executable_shape(self):
        normalized = to_executable_spec(_valid_spec())
        self.assertEqual(normalized["type"], "mssql")
        self.assertEqual(normalized["host"], "sqlserver.internal")
        self.assertEqual(normalized["port"], 1433)
        self.assertEqual(normalized["database"], "SBODemoDB")
        self.assertEqual(normalized["username"], "sa")
        self.assertEqual(normalized["password"], _SECRET)

    def test_defaults_port_when_absent(self):
        spec = _valid_spec()
        del spec["port"]
        normalized = to_executable_spec(spec)
        self.assertEqual(normalized["port"], 1433)

    def test_passes_through_resolved_timeout_when_present(self):
        normalized = to_executable_spec(_valid_spec(timeout=17))
        self.assertEqual(normalized["timeout"], 17)

    def test_does_not_invent_a_timeout_when_absent(self):
        normalized = to_executable_spec(_valid_spec())
        self.assertNotIn("timeout", normalized)

    def test_does_not_mutate_input_spec(self):
        spec = _valid_spec()
        original = dict(spec)
        to_executable_spec(spec)
        self.assertEqual(spec, original)

    # --- fail-closed rejection -----------------------------------------------------

    def test_rejects_missing_host(self):
        spec = _valid_spec()
        del spec["host"]
        with self.assertRaises(ValueError) as ctx:
            to_executable_spec(spec)
        self.assertIn("host", str(ctx.exception))

    def test_rejects_empty_host(self):
        with self.assertRaises(ValueError):
            to_executable_spec(_valid_spec(host=""))

    def test_rejects_missing_database(self):
        spec = _valid_spec()
        del spec["database"]
        with self.assertRaises(ValueError) as ctx:
            to_executable_spec(spec)
        self.assertIn("database", str(ctx.exception))

    def test_rejects_missing_username(self):
        spec = _valid_spec()
        del spec["username"]
        with self.assertRaises(ValueError) as ctx:
            to_executable_spec(spec)
        self.assertIn("username", str(ctx.exception))

    def test_rejects_missing_password(self):
        spec = _valid_spec()
        del spec["password"]
        with self.assertRaises(ValueError) as ctx:
            to_executable_spec(spec)
        self.assertIn("password", str(ctx.exception))

    def test_rejects_empty_password(self):
        with self.assertRaises(ValueError):
            to_executable_spec(_valid_spec(password=""))

    # --- credential safety -----------------------------------------------------

    def test_error_messages_never_contain_the_password_value(self):
        for missing_field in ("host", "database", "username", "password"):
            spec = _valid_spec()
            del spec[missing_field]
            try:
                to_executable_spec(spec)
                self.fail(f"expected ValueError for missing {missing_field!r}")
            except ValueError as e:
                self.assertNotIn(_SECRET, str(e))

    def test_error_message_is_field_name_only_never_a_value(self):
        spec = _valid_spec(username="unlikely-marker-value-42")
        del spec["password"]
        with self.assertRaises(ValueError) as ctx:
            to_executable_spec(spec)
        self.assertEqual(
            str(ctx.exception),
            "Structured mssql datasource spec missing required field: 'password'",
        )
        self.assertNotIn("unlikely-marker-value-42", str(ctx.exception))

    def test_safe_display_target_never_contains_username_or_password(self):
        label = safe_display_target(_valid_spec())
        self.assertNotIn(_SECRET, label)
        self.assertNotIn("sa", label)
        self.assertEqual(label, "mssql://sqlserver.internal:1433/SBODemoDB")

    def test_repr_of_normalized_result_can_be_inspected_without_raising(self):
        # Not a claim that the password is absent from the executable
        # spec's repr (it legitimately must carry it to authenticate,
        # exactly like db_source_pymssql.py's own spec contract already
        # does) — only that constructing/representing it never raises and
        # never routes through this module's own code paths as a print or
        # log call (see test_module_performs_no_io_or_logging below).
        normalized = to_executable_spec(_valid_spec())
        repr(normalized)  # must not raise

    # --- passthrough (specs this module does not own) -----------------------------------------------------

    def test_url_shaped_spec_is_returned_unchanged(self):
        spec = {"type": "mssql", "url": "mssql+pymssql://sa:x@host/db", "query": "SELECT 1"}
        result = to_executable_spec(spec)
        self.assertEqual(result, spec)

    def test_sqlite_spec_is_returned_unchanged(self):
        spec = {"type": "sqlite", "path": ":memory:", "query": "SELECT 1"}
        result = to_executable_spec(spec)
        self.assertEqual(result, spec)

    def test_returned_passthrough_is_a_copy_not_the_same_object(self):
        spec = {"type": "sqlite", "path": ":memory:"}
        result = to_executable_spec(spec)
        self.assertIsNot(result, spec)

    # --- no I/O -----------------------------------------------------

    def test_module_performs_no_io_or_logging(self):
        # AST-based, not line-based: a naive text/regex scan would false-
        # positive on this module's OWN docstring prose (which necessarily
        # discusses "print()"/"logging" while documenting that it avoids
        # them). Walking the parsed AST for actual Call/Import nodes is
        # immune to that — it only ever sees real code, never comments or
        # docstring text.
        import ast
        source = (ROOT / "reportforge" / "core" / "render" / "datasource" / "db_source_spec_adapter.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                self.assertFalse(
                    any(alias.name == "logging" for alias in node.names),
                    "unexpected 'import logging'",
                )
            if isinstance(node, ast.ImportFrom):
                self.assertNotEqual(node.module, "logging", "unexpected 'from logging import ...'")
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Name):
                    self.assertNotEqual(func.id, "print", "unexpected print() call")
                if isinstance(func, ast.Attribute):
                    self.assertNotEqual(func.attr, "print", "unexpected .print() call")
                    base = func.value
                    if isinstance(base, ast.Name):
                        self.assertNotEqual(base.id, "logging", "unexpected logging.* call")


if __name__ == "__main__":
    unittest.main()
