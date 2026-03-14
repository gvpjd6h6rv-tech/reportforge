# core/render/expressions/evaluator.py
# Enterprise Expression Evaluator
# Supports: arithmetic, comparisons, ternary, if/then/else, string ops,
#           aggregations, running totals, template variables, parameters,
#           full Crystal Reports function library (Phase 1)
from __future__ import annotations
import ast, re, datetime, uuid as _uuid_mod, os
from typing import Any, Optional, TYPE_CHECKING
if TYPE_CHECKING:
    from ..resolvers.field_resolver import FieldResolver

_EXPR_PAT   = re.compile(r'\{([^{}]+)\}')
_AGG_PAT    = re.compile(r'\b(sum|count|avg|min|max|first|last)\s*\(\s*([\w.]+)\s*\)')
_RUNSUM_PAT = re.compile(r'\brunningSum\s*\(\s*([\w.]+)\s*\)')
_RUNCNT_PAT = re.compile(r'\brunningCount\s*\(\s*([\w.]+)\s*\)')
_TERNARY    = re.compile(r'^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$', re.DOTALL)
_IF_THEN    = re.compile(r'^if\s+(.+?)\s+then\s+(.+?)(?:\s+else\s+(.+))?$', re.IGNORECASE | re.DOTALL)
_FIELD      = re.compile(r'\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+)\b')
_CALL_PAT   = re.compile(r'^([a-zA-Z_]\w*)\s*\((.*)?\)$', re.DOTALL)

_TEMPLATE_FUNCS = {
    "now":       lambda: datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
    "today":     lambda: datetime.date.today().strftime("%d/%m/%Y"),
    "uuid":      lambda: str(_uuid_mod.uuid4()),
    "timestamp": lambda: str(int(datetime.datetime.now().timestamp())),
}
_STRING_FUNCS = {
    "upper": lambda s: str(s).upper(),
    "lower": lambda s: str(s).lower(),
    "title": lambda s: str(s).title(),
    "strip": lambda s: str(s).strip(),
}

_ENV_PAT   = re.compile(r'\benv\.([\w_]+)\b')
_PARAM_PAT = re.compile(r'\bparam\.([\w_]+)\b')

_SIMPLE_FUNC_NAMES = (
    "now|today|uuid|timestamp|upper|lower|title|strip|len|"
    "year|month|day|hour|minute|second|dayofweek|"
    "tonumber|cbool|cstr|cdbl|cint|abs|sgn|sqrt|exp|log|sin|cos|pi|"
    "isnull|isdate|isnumber|isstring|val|asc|"
    "trimleft|trimright|propercase|reverse|fix|int|"
    "towords|datevalue|cdate"
)
_FUNC_PAT  = re.compile(r'\b(' + _SIMPLE_FUNC_NAMES + r')\s*\(([^)]*)\)')


def _split_args(s):
    args, current, depth, in_q, q_ch = [], [], 0, False, ''
    for ch in s:
        if in_q:
            current.append(ch)
            if ch == q_ch:
                in_q = False
        elif ch in ('"', "'"):
            in_q = True; q_ch = ch; current.append(ch)
        elif ch == '(':
            depth += 1; current.append(ch)
        elif ch == ')':
            depth -= 1; current.append(ch)
        elif ch == ',' and depth == 0:
            args.append(''.join(current).strip()); current = []
        else:
            current.append(ch)
    if current:
        args.append(''.join(current).strip())
    return [a for a in args if a]


class ExpressionEvaluator:
    def __init__(self, all_items, params=None, running_totals=None,
                 prev_item=None, next_item=None, record_number=0):
        self._items   = all_items
        self._params  = params or {}
        self._running = running_totals
        self._prev    = prev_item
        self._next    = next_item
        self._recno   = record_number

    def contains_expr(self, text):
        return bool(_EXPR_PAT.search(text))

    def eval_text(self, template, resolver, group_items=None):
        def _rep(m):
            try:
                return _coerce_str(self._eval(m.group(1).strip(), resolver, group_items))
            except Exception:
                return m.group(0)
        return _EXPR_PAT.sub(_rep, template)

    def eval_expr(self, expr, resolver, group_items=None):
        e = expr.strip()
        # Only strip outer braces if the ENTIRE expression is a single {field} ref
        if e.startswith("{") and e.endswith("}") and e.count("{") == 1 and e.count("}") == 1:
            e = e[1:-1].strip()
        return self._eval(e, resolver, group_items)

    def eval_and_format(self, expr, fmt, resolver):
        from ..resolvers.field_resolver import format_value
        val = self._eval(expr.strip("{}"), resolver)
        return format_value(val, fmt) if fmt else _coerce_str(val)

    def _eval(self, expr, resolver, group_items=None):
        expr = expr.strip()
        if not expr:
            return ""

        # 0) Pre-process {field} brace notation
        if '{' in expr:
            # Single {field} reference — strip braces and re-eval
            single = re.fullmatch(r'\{([^{}]+)\}', expr)
            if single:
                return self._eval(single.group(1).strip(), resolver, group_items)
            # Compound expression with embedded {field} refs — substitute first
            def _brace_sub(m):
                val = self._eval(m.group(1).strip(), resolver, group_items)
                if isinstance(val, bool):    return "True" if val else "False"
                if isinstance(val, (int, float)): return str(val)
                return repr(str(val))
            expr = _EXPR_PAT.sub(_brace_sub, expr)

        # 1) if/then/else
        m = _IF_THEN.match(expr)
        if m:
            cond   = self._eval(m.group(1).strip(), resolver, group_items)
            branch = m.group(2).strip() if cond else (m.group(3) or "").strip()
            return self._eval(branch, resolver, group_items) if branch else ""

        # 2) ternary cond ? a : b
        t = _TERNARY.match(expr)
        if t:
            cond = self._eval(t.group(1), resolver, group_items)
            return self._eval(t.group(2) if cond else t.group(3), resolver, group_items)

        # 3) pure aggregation
        agg = _AGG_PAT.fullmatch(expr)
        if agg:
            return self._agg(agg.group(1), agg.group(2), resolver, group_items)

        # 4) running totals
        rs = _RUNSUM_PAT.fullmatch(expr)
        if rs and self._running:
            return self._running.running_sum(rs.group(1))
        rc = _RUNCNT_PAT.fullmatch(expr)
        if rc and self._running:
            return self._running.running_count(rc.group(1))

        # 5) Previous / Next
        if re.fullmatch(r'previous\s*\(\s*[\w.]+\s*\)', expr, re.IGNORECASE):
            path = re.search(r'\(([\w.]+)\)', expr).group(1)
            if self._prev is not None:
                from ..resolvers.field_resolver import FieldResolver
                return FieldResolver(self._prev, self._items, self._params).get(path)
            return ""
        if re.fullmatch(r'next\s*\(\s*[\w.]+\s*\)', expr, re.IGNORECASE):
            path = re.search(r'\(([\w.]+)\)', expr).group(1)
            if self._next is not None:
                from ..resolvers.field_resolver import FieldResolver
                return FieldResolver(self._next, self._items, self._params).get(path)
            return ""

        # 6) simple no-arg template functions
        m2 = _FUNC_PAT.fullmatch(expr)
        if m2:
            fn_name, raw_arg = m2.group(1).lower(), m2.group(2).strip()
            if fn_name in _TEMPLATE_FUNCS and not raw_arg:
                return _TEMPLATE_FUNCS[fn_name]()
            if fn_name in _STRING_FUNCS and raw_arg:
                return _STRING_FUNCS[fn_name](self._eval(raw_arg, resolver, group_items))

        # 7) CR multi-arg function dispatch
        call_m = _CALL_PAT.fullmatch(expr)
        if call_m:
            fn_name = call_m.group(1).lower()
            raw_args = (call_m.group(2) or "").strip()
            from . import cr_functions as _cr
            if _cr.is_cr_function(fn_name):
                parts = _split_args(raw_args) if raw_args else []
                evaled = [self._eval(a, resolver, group_items) for a in parts]
                try:
                    return _cr.call(fn_name, evaled)
                except Exception:
                    return ""

        # 8) env / param
        if _ENV_PAT.fullmatch(expr):
            return os.environ.get(expr[4:], "")
        if _PARAM_PAT.fullmatch(expr):
            return self._params.get(expr[6:], "")

        # 9) simple field path
        if re.fullmatch(r'[a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*', expr):
            if expr.startswith("env."):
                return os.environ.get(expr[4:], "")
            if expr.startswith("param."):
                return self._params.get(expr[6:], "")
            return resolver.get(expr)

        # 10) quoted string literal
        if (expr.startswith('"') and expr.endswith('"')) or \
           (expr.startswith("'") and expr.endswith("'")):
            return expr[1:-1]

        # 11) compound arithmetic
        return self._arith(expr, resolver, group_items)

    def _agg(self, fn, path, resolver, group_items=None):
        from .aggregator import Aggregator
        items = group_items if group_items is not None else self._items
        return getattr(Aggregator(items), fn)(path)

    def _arith(self, expr, resolver, group_items=None):
        def _sa(m):
            v = self._agg(m.group(1), m.group(2), resolver, group_items)
            return str(float(v)) if isinstance(v, (int, float)) else repr(str(v))
        def _rs(m):
            return str(float(self._running.running_sum(m.group(1)))) if self._running else "0"
        def _rc(m):
            return str(self._running.running_count(m.group(1))) if self._running else "0"
        def _fn(m):
            fn_n, arg = m.group(1).lower(), m.group(2).strip()
            if fn_n in _TEMPLATE_FUNCS and not arg:
                return repr(_TEMPLATE_FUNCS[fn_n]())
            if fn_n in _STRING_FUNCS and arg:
                r = _STRING_FUNCS[fn_n](self._eval(arg, resolver, group_items))
                return str(r) if isinstance(r, (int, float)) else repr(str(r))
            from . import cr_functions as _cr
            if _cr.is_cr_function(fn_n):
                try:
                    evaled_arg = self._eval(arg, resolver, group_items) if arg else None
                    args = [evaled_arg] if evaled_arg is not None else []
                    r = _cr.call(fn_n, args)
                    return str(r) if isinstance(r, (int, float, bool)) else repr(str(r))
                except Exception:
                    pass
            return repr("")
        def _env(m): return repr(os.environ.get(m.group(1), ""))
        def _prm(m):
            v = self._params.get(m.group(1), "")
            return str(v) if isinstance(v, (int, float)) else repr(str(v))

        e = _AGG_PAT.sub(_sa, expr)
        e = _RUNSUM_PAT.sub(_rs, e)
        e = _RUNCNT_PAT.sub(_rc, e)
        e = _FUNC_PAT.sub(_fn, e)
        e = _ENV_PAT.sub(_env, e)
        e = _PARAM_PAT.sub(_prm, e)

        for field in sorted(set(_FIELD.findall(e)), key=len, reverse=True):
            val = resolver.get(field)
            if val in ("", None): val = 0
            if isinstance(val, (int, float)):  repl = str(val)
            elif isinstance(val, bool):        repl = "True" if val else "False"
            else:                              repl = repr(str(val))
            e = re.sub(r'\b' + re.escape(field) + r'\b', repl, e)

        return _safe_eval(e)


class _Vis(ast.NodeVisitor):
    _OK = {
        ast.Expression, ast.Constant, ast.Num, ast.Str,
        ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.IfExp,
        ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv,
        ast.Mod, ast.Pow, ast.USub, ast.UAdd,
        ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
        ast.And, ast.Or, ast.Not,
    }
    def generic_visit(self, node):
        if type(node) not in self._OK:
            raise ValueError(f"Forbidden: {type(node).__name__}")
        super().generic_visit(node)


def _safe_eval(expr):
    if not expr.strip():
        return ""
    try:
        tree = ast.parse(expr, mode="eval")
        _Vis().visit(tree)
        return eval(compile(tree, "<expr>", "eval"), {"__builtins__": {}}, {})  # noqa
    except Exception:
        return expr


def _coerce_str(val):
    if isinstance(val, float):
        return str(int(val)) if val == int(val) else f"{val:.6f}".rstrip("0").rstrip(".")
    if isinstance(val, bool):
        return "Yes" if val else "No"
    if isinstance(val, datetime.date):
        return val.strftime("%d/%m/%Y")
    return str(val) if val is not None else ""
