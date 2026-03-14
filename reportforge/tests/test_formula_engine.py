# reportforge/tests/test_formula_engine.py
# Comprehensive formula engine tests — formula parser + eval context
# All tests use unittest (no pytest dependency)
import sys, os, unittest, datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from reportforge.core.render.expressions.formula_parser import (
    parse_formula, tokenize, TT, EvalTiming, VarScope,
    NumLit, StrLit, BoolLit, NullLit, FieldRef, VarRef,
    BinOp, UnaryOp, FuncCall, IfExpr, VarDecl, Block, EvalTimingDecl,
)
from reportforge.core.render.expressions.eval_context import EvalContext


# ═══════════════════════════════════════════════════════
# 1. TOKENIZER
# ═══════════════════════════════════════════════════════

class TestTokenizer(unittest.TestCase):

    def _toks(self, src):
        return [(t.type, t.value) for t in tokenize(src) if t.type != TT.EOF]

    def test_number_integer(self):
        toks = self._toks("42")
        self.assertEqual(toks, [(TT.NUM, 42)])

    def test_number_float(self):
        toks = self._toks("3.14")
        self.assertEqual(toks[0], (TT.NUM, 3.14))

    def test_string_double_quote(self):
        self.assertEqual(self._toks('"hello"'), [(TT.STR, 'hello')])

    def test_string_single_quote(self):
        self.assertEqual(self._toks("'world'"), [(TT.STR, 'world')])

    def test_string_escaped_quote(self):
        self.assertEqual(self._toks('"it""s"'), [(TT.STR, "it\"s")])

    def test_field_reference(self):
        self.assertEqual(self._toks("{items.price}"), [(TT.FIELD, 'items.price')])

    def test_date_literal(self):
        toks = tokenize("#2024-01-15#")
        self.assertEqual(toks[0].type, TT.DATE)
        self.assertEqual(toks[0].value, "2024-01-15")

    def test_boolean_true(self):
        self.assertEqual(self._toks("True"), [(TT.BOOL, True)])

    def test_boolean_false(self):
        self.assertEqual(self._toks("False"), [(TT.BOOL, False)])

    def test_operators(self):
        ops = self._toks("+ - * / < > <= >= = <>")
        op_values = [v for _, v in ops]
        self.assertIn('+', op_values)
        self.assertIn('<>', op_values)
        self.assertIn('<=', op_values)

    def test_comment_skip(self):
        toks = self._toks("42 // this is a comment\n+ 1")
        self.assertEqual(len([t for t in toks if t[0] == TT.NUM]), 2)

    def test_block_comment_skip(self):
        toks = self._toks("1 /* ignore this */ + 2")
        self.assertEqual(len([t for t in toks if t[0] == TT.NUM]), 2)


# ═══════════════════════════════════════════════════════
# 2. PARSER
# ═══════════════════════════════════════════════════════

class TestParser(unittest.TestCase):

    def _p(self, src):
        return parse_formula(src)

    def test_number_literal(self):
        ast = self._p("42")
        self.assertIsInstance(ast, NumLit)
        self.assertEqual(ast.value, 42)

    def test_string_literal(self):
        ast = self._p('"hello"')
        self.assertIsInstance(ast, StrLit)
        self.assertEqual(ast.value, 'hello')

    def test_field_ref(self):
        ast = self._p("{items.price}")
        self.assertIsInstance(ast, FieldRef)
        self.assertEqual(ast.path, 'items.price')

    def test_var_ref(self):
        ast = self._p("myVar")
        self.assertIsInstance(ast, VarRef)
        self.assertEqual(ast.name, 'myVar')

    def test_binop_add(self):
        ast = self._p("1 + 2")
        self.assertIsInstance(ast, BinOp)
        self.assertEqual(ast.op, '+')

    def test_binop_precedence(self):
        # 1 + 2 * 3 should parse as 1 + (2*3)
        ast = self._p("1 + 2 * 3")
        self.assertIsInstance(ast, BinOp)
        self.assertEqual(ast.op, '+')
        self.assertIsInstance(ast.right, BinOp)
        self.assertEqual(ast.right.op, '*')

    def test_unary_minus(self):
        ast = self._p("-5")
        self.assertIsInstance(ast, UnaryOp)
        self.assertEqual(ast.op, '-')

    def test_function_call_noargs(self):
        ast = self._p("Today()")
        self.assertIsInstance(ast, FuncCall)
        self.assertEqual(ast.name.lower(), 'today')
        self.assertEqual(ast.args, [])

    def test_function_call_args(self):
        ast = self._p("Left(name, 3)")
        self.assertIsInstance(ast, FuncCall)
        self.assertEqual(len(ast.args), 2)

    def test_if_then_else(self):
        ast = self._p("If x > 0 Then 1 Else -1")
        self.assertIsInstance(ast, IfExpr)

    def test_if_then_no_else(self):
        ast = self._p("If True Then 42")
        self.assertIsInstance(ast, IfExpr)
        self.assertIsNone(ast.else_)

    def test_var_decl_local(self):
        ast = self._p("Local NumberVar x := 0")
        self.assertIsInstance(ast, VarDecl)
        self.assertEqual(ast.scope, VarScope.LOCAL)
        self.assertEqual(ast.name, 'x')

    def test_var_decl_global(self):
        ast = self._p("Global StringVar greeting")
        self.assertIsInstance(ast, VarDecl)
        self.assertEqual(ast.scope, VarScope.GLOBAL)

    def test_var_decl_shared(self):
        ast = self._p("Shared NumberVar counter")
        self.assertIsInstance(ast, VarDecl)
        self.assertEqual(ast.scope, VarScope.SHARED)

    def test_eval_timing_reading(self):
        ast = self._p("WhileReadingRecords")
        self.assertIsInstance(ast, EvalTimingDecl)
        self.assertEqual(ast.timing, EvalTiming.WHILE_READING)

    def test_eval_timing_printing(self):
        ast = self._p("WhilePrintingRecords")
        self.assertIsInstance(ast, EvalTimingDecl)
        self.assertEqual(ast.timing, EvalTiming.WHILE_PRINTING)

    def test_block_multiple_stmts(self):
        ast = self._p("Local NumberVar x := 1; x + 1")
        self.assertIsInstance(ast, Block)
        self.assertEqual(len(ast.stmts), 2)

    def test_comparison_neq(self):
        ast = self._p("a <> b")
        self.assertIsInstance(ast, BinOp)
        self.assertEqual(ast.op, '<>')

    def test_logical_and(self):
        ast = self._p("a And b")
        self.assertIsInstance(ast, BinOp)
        self.assertEqual(ast.op, 'and')

    def test_logical_or(self):
        ast = self._p("a Or b")
        self.assertIsInstance(ast, BinOp)
        self.assertEqual(ast.op, 'or')

    def test_string_concat(self):
        ast = self._p('"Hello" & " " & "World"')
        # Should be left-associative BinOp &
        self.assertIsInstance(ast, BinOp)
        self.assertEqual(ast.op, '&')

    def test_in_operator(self):
        ast = self._p("x In (1, 2, 3)")
        self.assertIsInstance(ast, FuncCall)
        self.assertEqual(ast.name, '__in__')

    def test_between_operator(self):
        ast = self._p("x Between 1 And 10")
        self.assertIsInstance(ast, FuncCall)
        self.assertEqual(ast.name, '__between__')

    def test_nested_function(self):
        ast = self._p("ToText(Round(x, 2))")
        self.assertIsInstance(ast, FuncCall)
        self.assertEqual(ast.args[0].__class__.__name__, 'FuncCall')

    def test_parentheses_grouping(self):
        # (1 + 2) * 3 should parse with * at root
        ast = self._p("(1 + 2) * 3")
        self.assertIsInstance(ast, BinOp)
        self.assertEqual(ast.op, '*')


# ═══════════════════════════════════════════════════════
# 3. EVAL CONTEXT — ARITHMETIC
# ═══════════════════════════════════════════════════════

class TestEvalArithmetic(unittest.TestCase):

    def setUp(self):
        self.ctx = EvalContext()
        self.ctx.set_record({'price': 100.0, 'qty': 3, 'name': 'Widget'}, 1)

    def _e(self, expr):
        return self.ctx.eval_formula(expr)

    def test_number_literal(self):
        self.assertEqual(self._e("42"), 42)

    def test_float_literal(self):
        self.assertAlmostEqual(self._e("3.14"), 3.14)

    def test_addition(self):
        self.assertEqual(self._e("1 + 2"), 3.0)

    def test_subtraction(self):
        self.assertEqual(self._e("10 - 3"), 7.0)

    def test_multiplication(self):
        self.assertEqual(self._e("4 * 5"), 20.0)

    def test_division(self):
        self.assertEqual(self._e("10 / 4"), 2.5)

    def test_division_by_zero(self):
        self.assertEqual(self._e("10 / 0"), 0)

    def test_exponent(self):
        self.assertEqual(self._e("2 ^ 8"), 256.0)

    def test_unary_minus(self):
        self.assertEqual(self._e("-5"), -5)

    def test_operator_precedence(self):
        self.assertEqual(self._e("2 + 3 * 4"), 14.0)

    def test_parentheses(self):
        self.assertEqual(self._e("(2 + 3) * 4"), 20.0)

    def test_field_arithmetic(self):
        self.assertAlmostEqual(self._e("{price} * {qty}"), 300.0)

    def test_field_ref_direct(self):
        self.assertEqual(self._e("{price}"), 100.0)

    def test_varref_resolves_record(self):
        self.assertEqual(self._e("price"), 100.0)

    def test_string_concat_ampersand(self):
        self.assertEqual(self._e('"Hello" & " World"'), "Hello World")

    def test_string_literal(self):
        self.assertEqual(self._e('"hello"'), "hello")

    def test_boolean_true(self):
        self.assertEqual(self._e("True"), True)

    def test_boolean_false(self):
        self.assertEqual(self._e("False"), False)

    def test_null_literal(self):
        self.assertIsNone(self._e("Null"))


# ═══════════════════════════════════════════════════════
# 4. EVAL CONTEXT — COMPARISONS & LOGIC
# ═══════════════════════════════════════════════════════

class TestEvalComparisons(unittest.TestCase):

    def setUp(self):
        self.ctx = EvalContext()
        self.ctx.set_record({'x': 10, 'y': 20})

    def _e(self, expr):
        return self.ctx.eval_formula(expr)

    def test_equal_true(self):
        self.assertTrue(self._e("10 = 10"))

    def test_equal_false(self):
        self.assertFalse(self._e("10 = 11"))

    def test_neq_true(self):
        self.assertTrue(self._e("10 <> 11"))

    def test_lt(self):
        self.assertTrue(self._e("5 < 10"))

    def test_gt(self):
        self.assertTrue(self._e("10 > 5"))

    def test_lte(self):
        self.assertTrue(self._e("10 <= 10"))

    def test_gte(self):
        self.assertTrue(self._e("10 >= 9"))

    def test_and_true(self):
        self.assertTrue(self._e("True And True"))

    def test_and_false(self):
        self.assertFalse(self._e("True And False"))

    def test_or_true(self):
        self.assertTrue(self._e("False Or True"))

    def test_or_false(self):
        self.assertFalse(self._e("False Or False"))

    def test_not_true(self):
        self.assertFalse(self._e("Not True"))

    def test_not_false(self):
        self.assertTrue(self._e("Not False"))

    def test_in_operator(self):
        self.ctx.set_record({'status': 'A'})
        self.assertTrue(self._e('status In ("A", "B", "C")'))

    def test_in_operator_miss(self):
        self.ctx.set_record({'status': 'Z'})
        self.assertFalse(self._e('status In ("A", "B", "C")'))

    def test_between_true(self):
        self.ctx.set_record({'score': 75})
        self.assertTrue(self._e("score Between 50 And 100"))

    def test_between_false(self):
        self.ctx.set_record({'score': 30})
        self.assertFalse(self._e("score Between 50 And 100"))


# ═══════════════════════════════════════════════════════
# 5. EVAL CONTEXT — IF/THEN/ELSE
# ═══════════════════════════════════════════════════════

class TestEvalIfThen(unittest.TestCase):

    def setUp(self):
        self.ctx = EvalContext()

    def _e(self, expr, record=None):
        if record:
            self.ctx.set_record(record)
        return self.ctx.eval_formula(expr)

    def test_if_true_branch(self):
        self.assertEqual(self._e("If True Then 1 Else 2"), 1)

    def test_if_false_branch(self):
        self.assertEqual(self._e("If False Then 1 Else 2"), 2)

    def test_if_no_else_true(self):
        result = self._e("If True Then 42")
        self.assertEqual(result, 42)

    def test_if_no_else_false(self):
        result = self._e("If False Then 42")
        self.assertIsNone(result)

    def test_iif_true(self):
        self.assertEqual(self._e("IIf(True, 'yes', 'no')"), 'yes')

    def test_iif_false(self):
        self.assertEqual(self._e("IIf(False, 'yes', 'no')"), 'no')

    def test_iif_condition_expr(self):
        r = self._e("IIf({total} > 100, 'High', 'Low')", {'total': 150})
        self.assertEqual(r, 'High')

    def test_if_with_field(self):
        r = self._e("If {score} >= 90 Then 'A' Else 'B'", {'score': 92})
        self.assertEqual(r, 'A')

    def test_nested_iif(self):
        r = self._e("IIf({x} > 0, IIf({x} > 10, 'big', 'small'), 'neg')",
                    {'x': 5})
        self.assertEqual(r, 'small')

    def test_isnull_true(self):
        self.ctx.set_record({'val': None})
        self.assertTrue(self._e("IsNull({val})"))

    def test_isnull_false(self):
        self.ctx.set_record({'val': 42})
        self.assertFalse(self._e("IsNull({val})"))

    def test_isnull_with_iif(self):
        self.ctx.set_record({'val': None})
        r = self._e("IIf(IsNull({val}), 0, {val})")
        self.assertEqual(r, 0)


# ═══════════════════════════════════════════════════════
# 6. EVAL CONTEXT — STRING FUNCTIONS
# ═══════════════════════════════════════════════════════

class TestEvalStringFunctions(unittest.TestCase):

    def setUp(self):
        self.ctx = EvalContext()
        self.ctx.set_record({'name': 'Crystal Reports'})

    def _e(self, expr):
        return self.ctx.eval_formula(expr)

    def test_ucase(self):
        self.assertEqual(self._e('UCase("hello")'), 'HELLO')

    def test_lcase(self):
        self.assertEqual(self._e('LCase("HELLO")'), 'hello')

    def test_trim(self):
        self.assertEqual(self._e('Trim("  hi  ")'), 'hi')

    def test_ltrim(self):
        self.assertEqual(self._e('LTrim("  hi")'), 'hi')

    def test_rtrim(self):
        self.assertEqual(self._e('RTrim("hi  ")'), 'hi')

    def test_len(self):
        self.assertEqual(self._e('Len("hello")'), 5)

    def test_left(self):
        self.assertEqual(self._e('Left("hello", 3)'), 'hel')

    def test_right(self):
        self.assertEqual(self._e('Right("hello", 3)'), 'llo')

    def test_mid(self):
        self.assertEqual(self._e('Mid("hello", 2, 3)'), 'ell')

    def test_instr(self):
        # InStr(haystack, needle) — returns 1-based position
        result = self._e('InStr("hello", "ell")')
        self.assertGreater(result, 0)

    def test_replace(self):
        self.assertEqual(self._e('Replace("hello world", "world", "there")'), 'hello there')

    def test_space(self):
        self.assertEqual(self._e('Space(3)'), '   ')

    def test_replicate(self):
        self.assertEqual(self._e('ReplicateString("ab", 3)'), 'ababab')

    def test_concat_with_field(self):
        r = self._e('"Hello, " & {name}')
        self.assertEqual(r, 'Hello, Crystal Reports')

    def test_totext_number(self):
        r = self._e('ToText(3.14159, 2)')
        self.assertEqual(r, '3.14')

    def test_tostring(self):
        r = self._e('ToString(42)')
        self.assertEqual(r, '42')


# ═══════════════════════════════════════════════════════
# 7. EVAL CONTEXT — NUMERIC FUNCTIONS
# ═══════════════════════════════════════════════════════

class TestEvalNumericFunctions(unittest.TestCase):

    def setUp(self):
        self.ctx = EvalContext()

    def _e(self, expr, record=None):
        if record:
            self.ctx.set_record(record)
        return self.ctx.eval_formula(expr)

    def test_abs_positive(self):
        self.assertEqual(self._e("Abs(-5)"), 5)

    def test_abs_negative(self):
        self.assertEqual(self._e("Abs(5)"), 5)

    def test_round(self):
        self.assertAlmostEqual(self._e("Round(3.14159, 2)"), 3.14)

    def test_round_integer(self):
        self.assertEqual(self._e("Round(3.7, 0)"), 4.0)

    def test_truncate(self):
        self.assertEqual(self._e("Truncate(3.9)"), 3)

    def test_sqrt(self):
        self.assertAlmostEqual(self._e("Sqrt(16)"), 4.0)

    def test_pi(self):
        import math
        self.assertAlmostEqual(self._e("Pi()"), math.pi)

    def test_power(self):
        self.assertEqual(self._e("Power(2, 10)"), 1024.0)

    def test_remainder(self):
        self.assertEqual(self._e("Remainder(10, 3)"), 1.0)

    def test_sgn_pos(self):
        self.assertEqual(self._e("Sgn(5)"), 1)

    def test_sgn_neg(self):
        self.assertEqual(self._e("Sgn(-5)"), -1)

    def test_sgn_zero(self):
        self.assertEqual(self._e("Sgn(0)"), 0)

    def test_tonumber(self):
        self.assertEqual(self._e('ToNumber("42.5")'), 42.5)

    def test_tonumber_field(self):
        self.ctx.set_record({'v': '99'})
        self.assertEqual(self._e("ToNumber({v})"), 99.0)


# ═══════════════════════════════════════════════════════
# 8. EVAL CONTEXT — DATE FUNCTIONS
# ═══════════════════════════════════════════════════════

class TestEvalDateFunctions(unittest.TestCase):

    def setUp(self):
        self.ctx = EvalContext()
        self.ctx.set_record({'hire_date': '2020-03-15', 'dob': '1990-06-20'})

    def _e(self, expr):
        return self.ctx.eval_formula(expr)

    def test_year(self):
        self.assertEqual(self._e("Year(#2024-01-15#)"), 2024)

    def test_month(self):
        self.assertEqual(self._e("Month(#2024-06-01#)"), 6)

    def test_day(self):
        self.assertEqual(self._e("Day(#2024-01-15#)"), 15)

    def test_today(self):
        result = self._e("Today()")
        self.assertIsInstance(result, datetime.date)

    def test_dateadd_days(self):
        result = self._e("DateAdd('d', 30, #2024-01-01#)")
        self.assertEqual(result, datetime.date(2024, 1, 31))

    def test_dateadd_months(self):
        result = self._e("DateAdd('m', 2, #2024-01-01#)")
        self.assertEqual(result.month, 3)

    def test_dateadd_years(self):
        result = self._e("DateAdd('y', 1, #2024-01-01#)")
        self.assertEqual(result.year, 2025)

    def test_datediff_days(self):
        result = self._e("DateDiff('d', #2024-01-01#, #2024-01-31#)")
        self.assertEqual(result, 30)

    def test_datediff_months(self):
        result = self._e("DateDiff('m', #2024-01-01#, #2024-04-01#)")
        self.assertEqual(result, 3)

    def test_datediff_years(self):
        result = self._e("DateDiff('y', #2020-01-01#, #2024-01-01#)")
        self.assertEqual(result, 4)

    def test_dateserial(self):
        result = self._e("DateSerial(2024, 3, 15)")
        self.assertEqual(result, datetime.date(2024, 3, 15))

    def test_cdate_field(self):
        result = self._e("CDate({hire_date})")
        self.assertEqual(result, datetime.date(2020, 3, 15))


# ═══════════════════════════════════════════════════════
# 9. EVAL CONTEXT — AGGREGATIONS
# ═══════════════════════════════════════════════════════

class TestEvalAggregations(unittest.TestCase):

    def setUp(self):
        self.ctx = EvalContext()
        records = [
            {'name': 'A', 'total': 100, 'qty': 2},
            {'name': 'B', 'total': 200, 'qty': 5},
            {'name': 'C', 'total': 150, 'qty': 3},
            {'name': 'A', 'total': 50,  'qty': 1},
        ]
        self.ctx.set_records(records)
        self.ctx.set_group(records)

    def _e(self, expr):
        return self.ctx.eval_formula(expr)

    def test_sum(self):
        self.assertEqual(self._e("Sum('total')"), 500.0)

    def test_avg(self):
        self.assertEqual(self._e("Avg('total')"), 125.0)

    def test_count(self):
        self.assertEqual(self._e("Count('name')"), 4)

    def test_max(self):
        self.assertEqual(self._e("Maximum('total')"), 200)

    def test_min(self):
        self.assertEqual(self._e("Minimum('total')"), 50)

    def test_distinct_count(self):
        self.assertEqual(self._e("DistinctCount('name')"), 3)


# ═══════════════════════════════════════════════════════
# 10. EVAL CONTEXT — VARIABLE SCOPES
# ═══════════════════════════════════════════════════════

class TestEvalVariableScopes(unittest.TestCase):

    def setUp(self):
        self.ctx = EvalContext()

    def test_local_var_decl(self):
        result = self.ctx.eval_formula("Local NumberVar x := 42; x")
        self.assertEqual(result, 42)

    def test_global_var_persists(self):
        self.ctx.eval_formula("Global NumberVar counter := 0")
        self.ctx.eval_formula("Global NumberVar counter := 0")
        # Second call should not reset (already declared)
        result = self.ctx.eval_formula("Global NumberVar counter")
        self.assertEqual(result, 0)

    def test_global_var_set_and_read(self):
        self.ctx._global['myGlobal'] = 99
        result = self.ctx.eval_formula("myGlobal")
        self.assertEqual(result, 99)

    def test_shared_var_persists(self):
        self.ctx.eval_formula("Shared NumberVar sharedVal := 77")
        result = self.ctx._shared.get('sharedVal')
        self.assertEqual(result, 77)

    def test_local_isolation(self):
        # Local vars should not leak between eval_formula calls
        self.ctx.eval_formula("Local NumberVar temp := 100")
        # 'temp' is local, won't be in global or shared
        self.assertNotIn('temp', self.ctx._global)
        self.assertNotIn('temp', self.ctx._shared)

    def test_var_arithmetic(self):
        result = self.ctx.eval_formula("Local NumberVar x := 10; Local NumberVar y := 5; x + y")
        self.assertEqual(result, 15)

    def test_string_var(self):
        result = self.ctx.eval_formula('Local StringVar s := "hello"; UCase(s)')
        self.assertEqual(result, "HELLO")


# ═══════════════════════════════════════════════════════
# 11. EVAL CONTEXT — EVAL TIMING
# ═══════════════════════════════════════════════════════

class TestEvalTiming(unittest.TestCase):

    def setUp(self):
        self.ctx = EvalContext()

    def test_timing_decl_while_reading(self):
        result = self.ctx.eval_formula("WhileReadingRecords; 42")
        # timing decl is a no-op, result is 42
        self.assertEqual(result, 42)

    def test_timing_decl_while_printing(self):
        result = self.ctx.eval_formula("WhilePrintingRecords; 'hello'")
        self.assertEqual(result, 'hello')

    def test_register_formula_with_timing(self):
        from reportforge.core.render.expressions.formula_parser import EvalTiming
        self.ctx.register_formula('myFormula', '{total} * 1.1', EvalTiming.WHILE_READING)
        self.ctx.set_record({'total': 100})
        result = self.ctx.eval('myFormula')
        self.assertAlmostEqual(result, 110.0)

    def test_registered_formula_name_lookup(self):
        self.ctx.register_formula('discount', 'IIf({total} > 1000, 0.1, 0.05)')
        self.ctx.set_record({'total': 1500})
        result = self.ctx.eval('discount')
        self.assertAlmostEqual(result, 0.1)


# ═══════════════════════════════════════════════════════
# 12. INTEGRATION — EVALUATOR BACKWARD COMPAT
# ═══════════════════════════════════════════════════════

class TestEvaluatorBackwardCompat(unittest.TestCase):
    """Ensure the existing ExpressionEvaluator still works."""

    def setUp(self):
        from reportforge.core.render.expressions.evaluator import ExpressionEvaluator
        from reportforge.core.render.resolvers.field_resolver import FieldResolver
        self.items = [{'price': 10, 'qty': 5, 'name': 'Widget'}]
        self.ev = ExpressionEvaluator(self.items)
        self.resolver = FieldResolver({'items': self.items}, self.items[0])

    def test_field_resolution(self):
        result = self.ev.eval_expr('{price}', self.resolver)
        self.assertEqual(result, 10)

    def test_arithmetic(self):
        result = self.ev.eval_expr('{price} * {qty}', self.resolver)
        self.assertEqual(float(result), 50.0)

    def test_if_then_else(self):
        result = self.ev.eval_expr('if {price} > 5 then "expensive" else "cheap"', self.resolver)
        self.assertEqual(result, 'expensive')

    def test_cr_function_ucase(self):
        result = self.ev.eval_expr('UCase({name})', self.resolver)
        self.assertEqual(result, 'WIDGET')

    def test_pi(self):
        import math
        result = self.ev.eval_expr('Pi()', self.resolver)
        self.assertAlmostEqual(float(result), math.pi, places=5)

    def test_aggregation_sum(self):
        result = self.ev.eval_expr('sum(price)', self.resolver)
        self.assertEqual(float(result), 10.0)

    def test_isnull(self):
        from reportforge.core.render.resolvers.field_resolver import FieldResolver
        r2 = FieldResolver({'items': self.items}, {'price': None, 'qty': 0, 'name': ''})
        result = self.ev.eval_expr('isnull(price)', r2)
        # Returns truthy for null — could be True or 'Yes'
        self.assertTrue(bool(result) or result in (True, 'Yes', 1))


# ═══════════════════════════════════════════════════════
# 13. EDGE CASES
# ═══════════════════════════════════════════════════════

class TestEdgeCases(unittest.TestCase):

    def setUp(self):
        self.ctx = EvalContext()

    def _e(self, expr, rec=None):
        if rec: self.ctx.set_record(rec)
        return self.ctx.eval_formula(expr)

    def test_empty_expr(self):
        result = self._e("")
        self.assertIsNone(result)

    def test_null_in_arithmetic(self):
        # Null treated as 0
        self.ctx.set_record({'val': None})
        result = self._e("{val} + 10")
        self.assertAlmostEqual(result, 10.0)

    def test_division_by_zero_safe(self):
        self.assertEqual(self._e("5 / 0"), 0)

    def test_deeply_nested_parens(self):
        self.assertEqual(self._e("((((42))))"), 42)

    def test_mixed_string_number_comparison(self):
        # Should not crash
        result = self._e('"10" = 10')
        # Either True or False, just must not crash
        self.assertIsNotNone(result)

    def test_function_case_insensitive(self):
        self.assertEqual(self._e('ucase("hello")'), 'HELLO')
        self.assertEqual(self._e('UCASE("hello")'), 'HELLO')
        self.assertEqual(self._e('Ucase("hello")'), 'HELLO')

    def test_field_not_found(self):
        result = self._e("{nonexistent}")
        self.assertIsNone(result)

    def test_large_number(self):
        result = self._e("1000000 * 1000000")
        self.assertEqual(result, 1e12)

    def test_negative_pow(self):
        # 2^-1 = 0.5
        result = self._e("2 ^ (-1)")
        self.assertAlmostEqual(result, 0.5)

    def test_params_access(self):
        self.ctx.set_params({'region': 'North', 'year': 2024})
        result = self._e("param.region")
        self.assertEqual(result, 'North')


if __name__ == '__main__':
    unittest.main(verbosity=2)
