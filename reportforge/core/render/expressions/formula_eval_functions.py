from __future__ import annotations

from typing import Any, Dict

from .formula_ast import FuncCall
from .formula_eval_aggregates import (
    agg_avg,
    agg_count,
    agg_distinct_count,
    agg_max,
    agg_min,
    agg_sum,
)
from .type_coercion import cmp, date_part, dateadd, datediff, eq, parse_date, to_num, to_text, truthy


def eval_func(evaluator, node: FuncCall, local: Dict) -> Any:
    from .formula_eval_dispatch import eval_node

    name = node.name.lower()
    args_raw = node.args

    if name == "__in__":
        val = eval_node(evaluator, args_raw[0], local)
        return any(eq(val, eval_node(evaluator, a, local)) for a in args_raw[1:])
    if name == "__between__":
        val = eval_node(evaluator, args_raw[0], local)
        lo = eval_node(evaluator, args_raw[1], local)
        hi = eval_node(evaluator, args_raw[2], local)
        return cmp(val, lo) >= 0 and cmp(val, hi) <= 0

    if name == "iif":
        if len(args_raw) < 3:
            return None
        cond = eval_node(evaluator, args_raw[0], local)
        return eval_node(evaluator, args_raw[1] if truthy(cond) else args_raw[2], local)
    if name == "if":
        return eval_func(evaluator, FuncCall("iif", args_raw), local)
    if name == "choose":
        idx = int(to_num(eval_node(evaluator, args_raw[0], local)))
        if 1 <= idx <= len(args_raw) - 1:
            return eval_node(evaluator, args_raw[idx], local)
        return None
    if name == "switch":
        for i in range(0, len(args_raw) - 1, 2):
            if truthy(eval_node(evaluator, args_raw[i], local)):
                return eval_node(evaluator, args_raw[i + 1], local)
        return None

    args = [eval_node(evaluator, a, local) for a in args_raw]

    if name == "sum":
        return agg_sum(evaluator, args)
    if name in ("avg", "average"):
        return agg_avg(evaluator, args)
    if name == "count":
        return agg_count(evaluator, args)
    if name in ("maximum", "max"):
        return agg_max(evaluator, args)
    if name in ("minimum", "min"):
        return agg_min(evaluator, args)
    if name == "distinctcount":
        return agg_distinct_count(evaluator, args)

    if name == "isnull":
        return args[0] is None if args else True
    if name in ("isnumeric", "isnumber"):
        return isinstance(args[0], (int, float)) if args else False
    if name == "isdate":
        import datetime
        return isinstance(args[0], (datetime.date, datetime.datetime)) if args else False
    if name == "isstring":
        return isinstance(args[0], str) if args else False

    if name in ("totext", "cstr", "str", "tostring"):
        return to_text(args[0] if args else None, args[1] if len(args) >= 2 else None)
    if name in ("tonumber", "cdbl", "cint", "val", "num"):
        return to_num(args[0]) if args else 0
    if name in ("tobool", "cbool"):
        return truthy(args[0]) if args else False

    if name == "len":
        return len(str(args[0])) if args else 0
    if name in ("ucase", "uppercase", "upper"):
        return str(args[0]).upper() if args else ""
    if name in ("lcase", "lowercase", "lower"):
        return str(args[0]).lower() if args else ""
    if name == "trim":
        return str(args[0]).strip() if args else ""
    if name in ("ltrim", "trimleft"):
        return str(args[0]).lstrip() if args else ""
    if name in ("rtrim", "trimright"):
        return str(args[0]).rstrip() if args else ""
    if name == "left":
        return str(args[0])[:int(to_num(args[1]))] if len(args) >= 2 else ""
    if name == "right":
        n = int(to_num(args[1]))
        return str(args[0])[-n:] if n and len(args) >= 2 else ""
    if name == "mid":
        s = str(args[0])
        start = max(0, int(to_num(args[1])) - 1)
        length = int(to_num(args[2])) if len(args) >= 3 else len(s)
        return s[start:start + length]
    if name == "instr":
        if len(args) == 2:
            haystack, needle = str(args[0]), str(args[1])
            pos = haystack.find(needle)
            return pos + 1 if pos >= 0 else 0
        if len(args) >= 3:
            start = int(to_num(args[0])) - 1
            haystack, needle = str(args[1]), str(args[2])
            pos = haystack.find(needle, start)
            return pos + 1 if pos >= 0 else 0
        return 0
    if name == "replace":
        if len(args) < 3:
            return str(args[0]) if args else ""
        return str(args[0]).replace(str(args[1]), str(args[2]))
    if name == "space":
        return " " * int(to_num(args[0])) if args else ""
    if name in ("replicate", "replicatestring"):
        return str(args[0]) * int(to_num(args[1])) if len(args) >= 2 else ""

    if name == "abs":
        return abs(to_num(args[0])) if args else 0
    if name == "round":
        n = to_num(args[0])
        d = int(to_num(args[1])) if len(args) >= 2 else 0
        return round(n, d)
    if name in ("truncate", "int"):
        return int(to_num(args[0])) if args else 0
    if name == "sqrt":
        import math
        return math.sqrt(max(0, to_num(args[0]))) if args else 0
    if name == "pi":
        import math
        return math.pi
    if name == "power":
        return to_num(args[0]) ** to_num(args[1]) if len(args) >= 2 else 0
    if name == "remainder":
        return to_num(args[0]) % to_num(args[1]) if len(args) >= 2 else 0
    if name == "sgn":
        v = to_num(args[0]) if args else 0
        return 1 if v > 0 else (-1 if v < 0 else 0)

    if name == "year":
        return date_part(args[0], "year")
    if name == "month":
        return date_part(args[0], "month")
    if name == "day":
        return date_part(args[0], "day")
    if name == "hour":
        return date_part(args[0], "hour")
    if name == "minute":
        return date_part(args[0], "minute")
    if name == "second":
        return date_part(args[0], "second")
    if name in ("today", "currentdate"):
        import datetime
        return datetime.date.today()
    if name in ("now", "currentdatetime"):
        import datetime
        return datetime.datetime.now()
    if name == "dateadd":
        return dateadd(args)
    if name == "datediff":
        return datediff(args)
    if name == "dateserial":
        if len(args) >= 3:
            import datetime
            try:
                return datetime.date(int(args[0]), int(args[1]), int(args[2]))
            except Exception:
                return None
    if name == "cdate":
        return parse_date(str(args[0])) if args else None
    if name == "pagenumber":
        return evaluator._page_number
    if name == "totalpages":
        return evaluator._total_pages
    if name == "recordnumber":
        return evaluator._record_number
    try:
        from . import cr_functions as _cr
        if _cr.is_cr_function(name):
            return _cr.call(name, args)
    except Exception:
        pass
    return None
