from __future__ import annotations

import os
import re
from typing import Any, Optional

from .aggregator import Aggregator
from .evaluator_support import (
    _AGG_PAT,
    _CALL_PAT,
    _ENV_PAT,
    _EXPR_PAT,
    _FIELD,
    _FUNC_PAT,
    _IF_THEN,
    _PARAM_PAT,
    _RUNCNT_PAT,
    _RUNSUM_PAT,
    _STRING_FUNCS,
    _TERNARY,
    _TEMPLATE_FUNCS,
    coerce_str,
    safe_eval,
    split_args,
)


class ExpressionEvaluator:
    def __init__(self, all_items, params=None, running_totals=None,
                 prev_item=None, next_item=None, record_number=0):
        self._items = all_items
        self._params = params or {}
        self._running = running_totals
        self._prev = prev_item
        self._next = next_item
        self._recno = record_number

    def contains_expr(self, text):
        return bool(_EXPR_PAT.search(text))

    def eval_text(self, template, resolver, group_items=None):
        def _rep(m):
            try:
                return coerce_str(self._eval(m.group(1).strip(), resolver, group_items))
            except Exception:
                return m.group(0)
        return _EXPR_PAT.sub(_rep, template)

    def eval_expr(self, expr, resolver, group_items=None):
        e = expr.strip()
        if e.startswith("{") and e.endswith("}") and e.count("{") == 1 and e.count("}") == 1:
            e = e[1:-1].strip()
        return self._eval(e, resolver, group_items)

    def eval_and_format(self, expr, fmt, resolver):
        from ..resolvers.field_resolver import format_value
        val = self._eval(expr.strip("{}"), resolver)
        return format_value(val, fmt) if fmt else coerce_str(val)

    def _eval(self, expr, resolver, group_items=None):
        expr = expr.strip()
        if not expr:
            return ""

        if "{" in expr:
            single = re.fullmatch(r"\{([^{}]+)\}", expr)
            if single:
                return self._eval(single.group(1).strip(), resolver, group_items)

            def _brace_sub(m):
                val = self._eval(m.group(1).strip(), resolver, group_items)
                if isinstance(val, bool):
                    return "True" if val else "False"
                if isinstance(val, (int, float)):
                    return str(val)
                return repr(str(val))

            expr = _EXPR_PAT.sub(_brace_sub, expr)

        m = _IF_THEN.match(expr)
        if m:
            cond = self._eval(m.group(1).strip(), resolver, group_items)
            branch = m.group(2).strip() if cond else (m.group(3) or "").strip()
            return self._eval(branch, resolver, group_items) if branch else ""

        t = _TERNARY.match(expr)
        if t:
            cond = self._eval(t.group(1), resolver, group_items)
            return self._eval(t.group(2) if cond else t.group(3), resolver, group_items)

        agg = _AGG_PAT.fullmatch(expr)
        if agg:
            return self._agg(agg.group(1), agg.group(2), resolver, group_items)

        rs = _RUNSUM_PAT.fullmatch(expr)
        if rs and self._running:
            return self._running.running_sum(rs.group(1))
        rc = _RUNCNT_PAT.fullmatch(expr)
        if rc and self._running:
            return self._running.running_count(rc.group(1))

        if re.fullmatch(r"previous\s*\(\s*[\w.]+\s*\)", expr, re.IGNORECASE):
            path = re.search(r"\(([\w.]+)\)", expr).group(1)
            if self._prev is not None:
                from ..resolvers.field_resolver import FieldResolver
                return FieldResolver(self._prev, self._items, self._params).get(path)
            return ""
        if re.fullmatch(r"next\s*\(\s*[\w.]+\s*\)", expr, re.IGNORECASE):
            path = re.search(r"\(([\w.]+)\)", expr).group(1)
            if self._next is not None:
                from ..resolvers.field_resolver import FieldResolver
                return FieldResolver(self._next, self._items, self._params).get(path)
            return ""

        m2 = _FUNC_PAT.fullmatch(expr)
        if m2:
            fn_name, raw_arg = m2.group(1).lower(), m2.group(2).strip()
            if fn_name in _TEMPLATE_FUNCS and not raw_arg:
                return _TEMPLATE_FUNCS[fn_name]()
            if fn_name in _STRING_FUNCS and raw_arg:
                return _STRING_FUNCS[fn_name](self._eval(raw_arg, resolver, group_items))

        call_m = _CALL_PAT.fullmatch(expr)
        if call_m:
            fn_name = call_m.group(1).lower()
            raw_args = (call_m.group(2) or "").strip()
            from . import cr_functions as _cr
            if _cr.is_cr_function(fn_name):
                parts = split_args(raw_args) if raw_args else []
                evaled = [self._eval(a, resolver, group_items) for a in parts]
                try:
                    return _cr.call(fn_name, evaled)
                except Exception:
                    return ""

        if _ENV_PAT.fullmatch(expr):
            return os.environ.get(expr[4:], "")
        if _PARAM_PAT.fullmatch(expr):
            return self._params.get(expr[6:], "")

        if re.fullmatch(r"[a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*", expr):
            if expr.startswith("env."):
                return os.environ.get(expr[4:], "")
            if expr.startswith("param."):
                return self._params.get(expr[6:], "")
            return resolver.get(expr)

        if (expr.startswith('"') and expr.endswith('"')) or \
           (expr.startswith("'") and expr.endswith("'")):
            return expr[1:-1]

        return self._arith(expr, resolver, group_items)

    def _agg(self, fn, path, resolver, group_items=None):
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

        def _env(m):
            return repr(os.environ.get(m.group(1), ""))

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
            if val in ("", None):
                val = 0
            if isinstance(val, (int, float)):
                repl = str(val)
            elif isinstance(val, bool):
                repl = "True" if val else "False"
            else:
                repl = repr(str(val))
            e = re.sub(r"\b" + re.escape(field) + r"\b", repl, e)

        return safe_eval(e)
