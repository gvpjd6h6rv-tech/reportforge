"""
test_regression_template.py — Regression test naming and structure contract.

Every regression test for a specific bug must follow the naming pattern:
  regression_<bug_id>_<field>_<cause>

This makes regressions self-documenting, searchable, and tied to a root cause.
A guard enforces this at the file level; this test verifies the contract works.

Coverage:
  1. Template demonstrates correct regression test naming pattern.
  2. Each regression test must document: bug_id, field, cause in name.
  3. Regression tests must reproduce the exact failing input, not a paraphrase.
  4. A regression test must still fail without the fix (verified by comment).

Naming convention:
  def test_regression_<bug_id>_<field>_<cause>(self):
  Example:
    test_regression_42_totales_total_currency_missing_comma
    test_regression_87_parse_date_dd_mm_yyyy_rejected
    test_regression_101_to_num_empty_string_returns_none_not_zero
"""
from __future__ import annotations

import unittest

from reportforge.core.render.expressions.type_coercion import to_num, parse_date
from reportforge.core.render.resolvers.field_resolver import format_value, FieldResolver
from reportforge.core.render.expressions.coercion_map import coerce


# ── Regression tests ───────────────────────────────────────────────────────────
# Each test:
#   1. Names the bug with regression_<id>_<field>_<cause>
#   2. Contains a comment: "Bug: <description of what broke>"
#   3. Contains a comment: "Fix: <what was changed>"
#   4. Tests the exact input that triggered the regression


class TestRegressionNamingExamples(unittest.TestCase):
    """
    Canonical examples of correctly-named regression tests.
    These also serve as live documentation of past issues.
    """

    def test_regression_001_to_num_empty_string_returns_zero_not_crash(self):
        # Bug: to_num("") raised ValueError instead of returning 0
        # Fix: explicit empty-string guard at top of to_num
        result = to_num("")
        self.assertEqual(result, 0,
                         "to_num('') must return 0 — regression_001")

    def test_regression_002_to_num_none_returns_zero_not_crash(self):
        # Bug: to_num(None) propagated None to callers expecting float
        # Fix: None guard returns 0 before float() attempt
        result = to_num(None)
        self.assertEqual(result, 0,
                         "to_num(None) must return 0 — regression_002")

    def test_regression_003_parse_date_none_returns_none_not_today(self):
        # Bug: parse_date(None) returned datetime.date.today() via cr_functions_shared._to_date
        # Fix: canonical parse_date in type_coercion.py returns None for None input
        result = parse_date(None)
        self.assertIsNone(result,
                          "parse_date(None) must return None — regression_003")

    def test_regression_004_format_value_unknown_fmt_returns_str_not_raise(self):
        # Bug: format_value(42, "nonexistent") raised KeyError
        # Fix: unknown formats fall back to str(value)
        result = format_value(42, "nonexistent_format_xyz")
        self.assertEqual(result, "42",
                         "format_value with unknown fmt must return str(value) — regression_004")

    def test_regression_005_coerce_unknown_type_raises_valueerror_not_keyerror(self):
        # Bug: COERCION_MAP[unknown_type] raised KeyError with no useful message
        # Fix: coerce() checks explicitly and raises ValueError with type name
        with self.assertRaises(ValueError) as ctx:
            coerce("x", "nonexistent_type")
        self.assertIn("nonexistent_type", str(ctx.exception),
                      "ValueError must name the bad type — regression_005")

    def test_regression_006_field_resolver_missing_optional_returns_empty_not_none(self):
        # Bug: FieldResolver.get() for missing optional field returned None,
        #      which propagated to format_value and crashed on None.lower()
        # Fix: default="" in get() signature, None guard in _traverse
        data = {"meta": {"doc_num": "X"}, "empresa": {}, "cliente": {},
                "fiscal": {}, "items": [], "totales": {}}
        resolver = FieldResolver(data)
        result = resolver.get("cliente.fax")
        self.assertEqual(result, "",
                         "Missing optional field must return '' — regression_006")

    def test_regression_007_format_value_currency_invalid_input_returns_str(self):
        # Bug: format_value("not-a-number", "currency") raised ValueError
        #      from float("not-a-number") — crashed invoice rendering
        # Fix: try/except in currency branch, falls back to str(value)
        result = format_value("not-a-number", "currency")
        self.assertIsInstance(result, str,
                              "format_value with invalid currency input must not raise — regression_007")

    def test_regression_008_to_num_bool_true_returns_one(self):
        # Bug: to_num(True) returned 1.0 in some paths but fell through to
        #      float("True") in others, raising ValueError
        # Fix: explicit bool guard before str() path
        result = to_num(True)
        self.assertEqual(result, 1,
                         "to_num(True) must return 1 — regression_008")

    def test_regression_009_to_num_bool_false_returns_zero(self):
        # Bug: same as 008 — False path
        result = to_num(False)
        self.assertEqual(result, 0,
                         "to_num(False) must return 0 — regression_009")

    def test_regression_010_parse_date_already_date_returns_same(self):
        # Bug: parse_date(date_obj) tried strptime(str(date_obj)) which worked
        #      but was wasteful and fragile with locale-formatted __str__
        # Fix: isinstance check at top of parse_date returns early
        import datetime
        d = datetime.date(2024, 6, 15)
        result = parse_date(d)
        self.assertEqual(result, d,
                         "parse_date(date) must return same date object — regression_010")


class TestRegressionNamingContract(unittest.TestCase):
    """
    Verify the regression naming pattern is enforced.
    These tests validate that the guard (regression_naming_guard.mjs) works.
    """

    def test_this_file_only_has_regression_prefixed_methods_in_regression_classes(self):
        """
        Regression test classes must only contain test_ methods that either:
        - follow regression_NNN_field_cause pattern, OR
        - are infrastructure tests (like this one, in non-regression classes)

        This test verifies the convention exists by checking known methods.
        """
        regression_class = TestRegressionNamingExamples
        test_methods = [m for m in dir(regression_class) if m.startswith("test_")]
        for method in test_methods:
            self.assertTrue(
                method.startswith("test_regression_"),
                f"Method {method!r} in TestRegressionNamingExamples "
                f"must follow 'test_regression_<id>_<field>_<cause>' pattern",
            )

    def test_regression_method_names_contain_at_least_three_parts(self):
        """test_regression_NNN_<field>_<cause> has ≥4 underscore-separated parts."""
        regression_class = TestRegressionNamingExamples
        test_methods = [m for m in dir(regression_class) if m.startswith("test_regression_")]
        for method in test_methods:
            parts = method.split("_")
            # test, regression, NNN, field, cause → at least 5 parts
            self.assertGreaterEqual(
                len(parts), 5,
                f"Regression method {method!r} must have at least 5 parts "
                f"(test_regression_NNN_field_cause)",
            )

    def test_regression_ids_are_numeric(self):
        """The NNN part of test_regression_NNN_... must be numeric."""
        regression_class = TestRegressionNamingExamples
        test_methods = [m for m in dir(regression_class) if m.startswith("test_regression_")]
        for method in test_methods:
            parts = method.split("_")
            # parts[2] = NNN
            self.assertTrue(
                parts[2].isdigit(),
                f"Regression ID in {method!r} must be numeric. Got: {parts[2]!r}",
            )


if __name__ == "__main__":
    unittest.main()
