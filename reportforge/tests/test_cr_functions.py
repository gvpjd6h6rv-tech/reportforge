# tests/test_cr_functions.py
# 90+ tests for Crystal Reports formula language
# Phase 1 — Formula Language parity
import unittest, datetime, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from reportforge.core.render.expressions import cr_functions as cr
from reportforge.core.render.expressions.evaluator import ExpressionEvaluator, _split_args

# ── minimal resolver stub ──────────────────────────────────────

class _R:
    def __init__(self, data=None):
        self._d = data or {}
    def get(self, path, default=""):
        parts = path.split(".")
        v = self._d
        for p in parts:
            if isinstance(v, dict):
                v = v.get(p, default)
            else:
                return default
        return v


# ── _split_args ────────────────────────────────────────────────

class TestSplitArgs(unittest.TestCase):
    def test_single(self):        self.assertEqual(_split_args("a"), ["a"])
    def test_two(self):           self.assertEqual(_split_args("a, b"), ["a", "b"])
    def test_nested_paren(self):  self.assertEqual(_split_args("a, fn(b,c), d"), ["a", "fn(b,c)", "d"])
    def test_quoted_comma(self):  self.assertEqual(_split_args('"a,b", c'), ['"a,b"', "c"])
    def test_empty_str(self):     self.assertEqual(_split_args(""), [])


# ── Date functions ─────────────────────────────────────────────

class TestDateFunctions(unittest.TestCase):
    def test_dateadd_day(self):
        d = cr.fn_dateadd("d", 10, datetime.date(2024, 1, 1))
        self.assertEqual(d, datetime.date(2024, 1, 11))

    def test_dateadd_month(self):
        d = cr.fn_dateadd("m", 2, datetime.date(2024, 1, 15))
        self.assertEqual(d, datetime.date(2024, 3, 15))

    def test_dateadd_year(self):
        d = cr.fn_dateadd("yyyy", 1, datetime.date(2024, 6, 15))
        self.assertEqual(d, datetime.date(2025, 6, 15))

    def test_dateadd_week(self):
        d = cr.fn_dateadd("ww", 2, datetime.date(2024, 1, 1))
        self.assertEqual(d, datetime.date(2024, 1, 15))

    def test_dateadd_negative(self):
        d = cr.fn_dateadd("d", -5, datetime.date(2024, 1, 10))
        self.assertEqual(d, datetime.date(2024, 1, 5))

    def test_datediff_day(self):
        self.assertEqual(cr.fn_datediff("d", datetime.date(2024,1,1), datetime.date(2024,1,11)), 10)

    def test_datediff_month(self):
        self.assertEqual(cr.fn_datediff("m", datetime.date(2024,1,1), datetime.date(2024,3,1)), 2)

    def test_datediff_year(self):
        self.assertEqual(cr.fn_datediff("yyyy", datetime.date(2020,1,1), datetime.date(2024,1,1)), 4)

    def test_datediff_week(self):
        self.assertEqual(cr.fn_datediff("ww", datetime.date(2024,1,1), datetime.date(2024,1,15)), 2)

    def test_datediff_negative(self):
        self.assertEqual(cr.fn_datediff("d", datetime.date(2024,1,11), datetime.date(2024,1,1)), -10)

    def test_dateserial(self):
        self.assertEqual(cr.fn_dateserial(2024, 6, 15), datetime.date(2024, 6, 15))

    def test_datevalue_string(self):
        self.assertEqual(cr.fn_datevalue("2024-06-15"), datetime.date(2024, 6, 15))

    def test_datevalue_slash(self):
        self.assertEqual(cr.fn_datevalue("15/06/2024"), datetime.date(2024, 6, 15))

    def test_cdate(self):
        self.assertEqual(cr.fn_cdate("2024-06-15"), "15/06/2024")

    def test_year(self):
        self.assertEqual(cr.fn_year(datetime.date(2024, 6, 15)), 2024)

    def test_month(self):
        self.assertEqual(cr.fn_month(datetime.date(2024, 6, 15)), 6)

    def test_day(self):
        self.assertEqual(cr.fn_day(datetime.date(2024, 6, 15)), 15)

    def test_dayofweek_sunday(self):
        # 2024-01-07 is a Sunday
        self.assertEqual(cr.fn_dayofweek(datetime.date(2024, 1, 7)), 1)

    def test_dayofweek_monday(self):
        # 2024-01-08 is a Monday
        self.assertEqual(cr.fn_dayofweek(datetime.date(2024, 1, 8)), 2)

    def test_weekdayname(self):
        self.assertEqual(cr.fn_weekdayname(1), "Sunday")
        self.assertEqual(cr.fn_weekdayname(2), "Monday")
        self.assertEqual(cr.fn_weekdayname(7), "Saturday")

    def test_weekdayname_abbr(self):
        self.assertEqual(cr.fn_weekdayname(1, True), "Sun")

    def test_monthname(self):
        self.assertEqual(cr.fn_monthname(1), "January")
        self.assertEqual(cr.fn_monthname(12), "December")

    def test_monthname_abbr(self):
        self.assertEqual(cr.fn_monthname(3, True), "Mar")


# ── String functions ────────────────────────────────────────────

class TestStringFunctions(unittest.TestCase):
    def test_mid_full(self):
        self.assertEqual(cr.fn_mid("Hello World", 7, 5), "World")

    def test_mid_no_len(self):
        self.assertEqual(cr.fn_mid("Hello World", 7), "World")

    def test_mid_start_1(self):
        self.assertEqual(cr.fn_mid("ABC", 1, 2), "AB")

    def test_left(self):
        self.assertEqual(cr.fn_left("Hello", 3), "Hel")

    def test_left_zero(self):
        self.assertEqual(cr.fn_left("Hello", 0), "")

    def test_right(self):
        self.assertEqual(cr.fn_right("Hello", 3), "llo")

    def test_right_zero(self):
        self.assertEqual(cr.fn_right("Hello", 0), "")

    def test_instr_found(self):
        self.assertEqual(cr.fn_instr("Hello World", "World"), 7)

    def test_instr_not_found(self):
        self.assertEqual(cr.fn_instr("Hello World", "xyz"), 0)

    def test_instr_start(self):
        self.assertEqual(cr.fn_instr(6, "Hello World", "o"), 8)

    def test_replace(self):
        self.assertEqual(cr.fn_replace("Hello World", "World", "CR"), "Hello CR")

    def test_replace_no_match(self):
        self.assertEqual(cr.fn_replace("Hello", "xyz", "A"), "Hello")

    def test_split(self):
        self.assertEqual(cr.fn_split("a,b,c", ","), ["a", "b", "c"])

    def test_join(self):
        self.assertEqual(cr.fn_join(["a", "b", "c"], "-"), "a-b-c")

    def test_space(self):
        self.assertEqual(cr.fn_space(4), "    ")

    def test_space_zero(self):
        self.assertEqual(cr.fn_space(0), "")

    def test_chr(self):
        self.assertEqual(cr.fn_chr(65), "A")
        self.assertEqual(cr.fn_chr(97), "a")

    def test_asc(self):
        self.assertEqual(cr.fn_asc("A"), 65)
        self.assertEqual(cr.fn_asc("a"), 97)

    def test_val_integer(self):
        self.assertEqual(cr.fn_val("42abc"), 42.0)

    def test_val_float(self):
        self.assertAlmostEqual(cr.fn_val("3.14xyz"), 3.14)

    def test_val_empty(self):
        self.assertEqual(cr.fn_val(""), 0.0)

    def test_len(self):
        self.assertEqual(cr.fn_len("Hello"), 5)

    def test_trimleft(self):
        self.assertEqual(cr.fn_trimleft("  Hello  "), "Hello  ")

    def test_trimright(self):
        self.assertEqual(cr.fn_trimright("  Hello  "), "  Hello")

    def test_propercase(self):
        self.assertEqual(cr.fn_propercase("hello world"), "Hello World")

    def test_replicatestring(self):
        self.assertEqual(cr.fn_replicatestring("ab", 3), "ababab")

    def test_reverse(self):
        self.assertEqual(cr.fn_reverse("Hello"), "olleH")


# ── Conversion ─────────────────────────────────────────────────

class TestConversionFunctions(unittest.TestCase):
    def test_tonumber_string(self):
        self.assertEqual(cr.fn_tonumber("42"), 42.0)

    def test_tonumber_float_str(self):
        self.assertAlmostEqual(cr.fn_tonumber("3.14"), 3.14)

    def test_tonumber_empty(self):
        self.assertEqual(cr.fn_tonumber(""), 0.0)

    def test_totext_plain(self):
        self.assertEqual(cr.fn_totext(42), "42")

    def test_totext_decimals(self):
        self.assertEqual(cr.fn_totext(1234.5, 2), "1,234.50")

    def test_totext_zero_dec(self):
        self.assertEqual(cr.fn_totext(1235.5, 0), "1,236")

    def test_cbool_true(self):
        self.assertTrue(cr.fn_cbool("true"))
        self.assertTrue(cr.fn_cbool("YES"))
        self.assertTrue(cr.fn_cbool(1))

    def test_cbool_false(self):
        self.assertFalse(cr.fn_cbool("false"))
        self.assertFalse(cr.fn_cbool(0))

    def test_cstr(self):
        self.assertEqual(cr.fn_cstr(42), "42")
        self.assertEqual(cr.fn_cstr(3.14), "3.14")

    def test_cdbl(self):
        self.assertEqual(cr.fn_cdbl("3.14"), 3.14)

    def test_cint(self):
        self.assertEqual(cr.fn_cint(3.9), 3)
        self.assertEqual(cr.fn_cint("5"), 5)


# ── Math ────────────────────────────────────────────────────────

class TestMathFunctions(unittest.TestCase):
    def test_round_2(self):
        self.assertAlmostEqual(cr.fn_round(3.14159, 2), 3.14)

    def test_round_0(self):
        self.assertEqual(cr.fn_round(3.6), 4)

    def test_truncate(self):
        self.assertAlmostEqual(cr.fn_truncate(3.99, 1), 3.9)

    def test_truncate_zero(self):
        self.assertEqual(cr.fn_truncate(3.99), 3)

    def test_remainder(self):
        self.assertEqual(cr.fn_remainder(10, 3), 1)

    def test_remainder_float(self):
        self.assertAlmostEqual(cr.fn_remainder(10.5, 3), 1.5)

    def test_int_floor(self):
        self.assertEqual(cr.fn_int(3.9), 3)
        self.assertEqual(cr.fn_int(-3.1), -4)

    def test_fix_truncate(self):
        self.assertEqual(cr.fn_fix(3.9), 3)
        self.assertEqual(cr.fn_fix(-3.9), -3)

    def test_abs(self):
        self.assertEqual(cr.fn_abs(-5), 5)
        self.assertEqual(cr.fn_abs(5), 5)

    def test_sgn(self):
        self.assertEqual(cr.fn_sgn(5), 1)
        self.assertEqual(cr.fn_sgn(-3), -1)
        self.assertEqual(cr.fn_sgn(0), 0)

    def test_sqrt(self):
        self.assertAlmostEqual(cr.fn_sqrt(16), 4.0)

    def test_power(self):
        self.assertEqual(cr.fn_power(2, 10), 1024)

    def test_pi(self):
        import math
        self.assertAlmostEqual(cr.fn_pi(), math.pi)


# ── Formatting ─────────────────────────────────────────────────

class TestFormattingFunctions(unittest.TestCase):
    def test_numerictext_default(self):
        result = cr.fn_numerictext(1234567.8)
        self.assertIn("1,234,567", result)

    def test_numerictext_custom(self):
        result = cr.fn_numerictext(1234.5, "##,##0.00")
        self.assertIn("1,234.50", result)

    def test_towords_simple(self):
        self.assertEqual(cr.fn_towords(5), "Five")
        self.assertEqual(cr.fn_towords(0), "Zero")

    def test_towords_compound(self):
        w = cr.fn_towords(42)
        self.assertIn("Forty", w)
        self.assertIn("Two", w)

    def test_towords_hundreds(self):
        w = cr.fn_towords(100)
        self.assertIn("Hundred", w)

    def test_towords_thousands(self):
        w = cr.fn_towords(1000)
        self.assertIn("Thousand", w)

    def test_picture_phone(self):
        result = cr.fn_picture("5551234567", "(XXX) XXX-XXXX")
        self.assertEqual(result, "(555) 123-4567")

    def test_picture_short(self):
        result = cr.fn_picture("123", "XXX-XX")
        self.assertEqual(result, "123-  ")


# ── Null / type check ──────────────────────────────────────────

class TestNullTypeFunctions(unittest.TestCase):
    def test_isnull_none(self):         self.assertTrue(cr.fn_isnull(None))
    def test_isnull_empty(self):        self.assertTrue(cr.fn_isnull(""))
    def test_isnull_value(self):        self.assertFalse(cr.fn_isnull("hello"))
    def test_isdate_valid(self):        self.assertTrue(cr.fn_isdate("2024-01-01"))
    def test_isdate_invalid(self):      self.assertFalse(cr.fn_isdate("notadate"))
    def test_isnumber_int(self):        self.assertTrue(cr.fn_isnumber(42))
    def test_isnumber_float(self):      self.assertTrue(cr.fn_isnumber(3.14))
    def test_isnumber_string(self):     self.assertTrue(cr.fn_isnumber("42"))
    def test_isnumber_alpha(self):      self.assertFalse(cr.fn_isnumber("abc"))
    def test_isstring_true(self):       self.assertTrue(cr.fn_isstring("hello"))
    def test_isstring_false(self):      self.assertFalse(cr.fn_isstring(42))


# ── Conditional ────────────────────────────────────────────────

class TestConditionalFunctions(unittest.TestCase):
    def test_iif_true(self):
        self.assertEqual(cr.fn_iif(True, "yes", "no"), "yes")

    def test_iif_false(self):
        self.assertEqual(cr.fn_iif(False, "yes", "no"), "no")

    def test_choose(self):
        self.assertEqual(cr.fn_choose(2, "A", "B", "C"), "B")

    def test_choose_out_of_range(self):
        self.assertEqual(cr.fn_choose(5, "A", "B"), "")

    def test_switch_first_true(self):
        self.assertEqual(cr.fn_switch(True, "A", False, "B"), "A")

    def test_switch_second_true(self):
        self.assertEqual(cr.fn_switch(False, "A", True, "B"), "B")

    def test_switch_none_true(self):
        self.assertEqual(cr.fn_switch(False, "A", False, "B"), "")

    def test_inrange_true(self):
        self.assertTrue(cr.fn_in_range(5, 1, 10))

    def test_inrange_false(self):
        self.assertFalse(cr.fn_in_range(15, 1, 10))

    def test_inlist_true(self):
        self.assertTrue(cr.fn_in_list("B", "A", "B", "C"))

    def test_inlist_false(self):
        self.assertFalse(cr.fn_in_list("D", "A", "B", "C"))


# ── Evaluator integration with CR functions ────────────────────

class TestEvaluatorCRIntegration(unittest.TestCase):
    def _ev(self, items=None, params=None):
        return ExpressionEvaluator(items or [], params or {})

    def _r(self, data=None):
        return _R(data or {})

    def test_mid_in_expr(self):
        ev = self._ev()
        result = ev.eval_expr("Mid(\"Hello World\", 7, 5)", self._r())
        self.assertEqual(result, "World")

    def test_left_in_expr(self):
        ev = self._ev()
        result = ev.eval_expr('Left("Hello", 3)', self._r())
        self.assertEqual(result, "Hel")

    def test_round_in_expr(self):
        ev = self._ev()
        result = ev.eval_expr("Round(3.14159, 2)", self._r())
        self.assertAlmostEqual(float(result), 3.14)

    def test_abs_in_expr(self):
        ev = self._ev()
        result = ev.eval_expr("Abs(-42)", self._r())
        self.assertEqual(result, 42)

    def test_iif_in_expr(self):
        ev = self._ev()
        result = ev.eval_expr('IIF(1 > 0, "yes", "no")', self._r())
        self.assertEqual(result, "yes")

    def test_isnull_in_if(self):
        ev = self._ev()
        result = ev.eval_expr('If IsNull(items.total) Then "N/A" Else "OK"',
                              self._r({"items": {"total": None}}))
        self.assertEqual(result, "N/A")

    def test_totext_in_expr(self):
        ev = self._ev()
        result = ev.eval_expr("ToText(1234.5, 2)", self._r())
        self.assertIn("1,234.50", str(result))

    def test_replace_in_expr(self):
        ev = self._ev()
        r = ev.eval_expr('Replace("Hello World", "World", "CR")', self._r())
        self.assertEqual(r, "Hello CR")

    def test_inlist_in_if(self):
        ev = self._ev()
        r = ev.eval_expr('If InList("B", "A", "B", "C") Then "found" Else "not"', self._r())
        self.assertEqual(r, "found")

    def test_field_in_cr_func(self):
        ev = self._ev()
        r = ev.eval_expr('Len(items.name)', self._r({"items": {"name": "Hello"}}))
        self.assertEqual(r, 5)

    def test_nested_cr_funcs(self):
        ev = self._ev()
        r = ev.eval_expr('Left(Replace("Hello World", "World", "CR"), 8)', self._r())
        self.assertEqual(r, "Hello CR")

    def test_previous_with_prev_item(self):
        prev = {"sales": {"total": 100}}
        ev = ExpressionEvaluator([], {}, prev_item=prev)
        r = ev.eval_expr("Previous(sales.total)", self._r())
        self.assertEqual(r, 100)

    def test_previous_no_prev(self):
        ev = self._ev()
        r = ev.eval_expr("Previous(sales.total)", self._r())
        self.assertEqual(r, "")

    def test_eval_text_with_cr_func(self):
        ev = self._ev()
        t = ev.eval_text("Name: {Left(items.name, 3)}", self._r({"items": {"name": "Hello"}}))
        self.assertEqual(t, "Name: Hel")

    def test_choose_in_expr(self):
        ev = self._ev()
        r = ev.eval_expr('Choose(2, "Alpha", "Beta", "Gamma")', self._r())
        self.assertEqual(r, "Beta")

    def test_space_in_expr(self):
        ev = self._ev()
        r = ev.eval_expr("Len(Space(5))", self._r())
        self.assertEqual(r, 5)

    def test_chr_asc_roundtrip(self):
        ev = self._ev()
        r = ev.eval_expr("Asc(Chr(65))", self._r())
        self.assertEqual(r, 65)

    def test_dateadd_in_expr(self):
        ev = self._ev()
        r = ev.eval_expr("DateAdd(\"d\", 10, DateSerial(2024, 1, 1))", self._r())
        self.assertIsInstance(r, datetime.date)
        self.assertEqual(r, datetime.date(2024, 1, 11))

    def test_registry_completeness(self):
        """All registry entries should be callable"""
        from reportforge.core.render.expressions.cr_functions import REGISTRY
        self.assertGreater(len(REGISTRY), 50)
        for name, (fn, mn, mx) in REGISTRY.items():
            self.assertTrue(callable(fn), f"{name} not callable")


if __name__ == "__main__":
    unittest.main(verbosity=2)
