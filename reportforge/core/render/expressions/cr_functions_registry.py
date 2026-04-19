from __future__ import annotations

from typing import Any

from .cr_functions_conditionals import fn_choose, fn_iif, fn_in_list, fn_in_range, fn_switch
from .cr_functions_conversion import fn_cbool, fn_cdbl, fn_cint, fn_cstr, fn_tonumber, fn_totext
from .cr_functions_datetime import (
    fn_cdate, fn_currentdate, fn_currentdatetime, fn_dateadd, fn_datediff, fn_dateserial,
    fn_datevalue, fn_day, fn_dayofweek, fn_hour, fn_minute, fn_month, fn_monthname,
    fn_now, fn_second, fn_timer, fn_today, fn_weekdayname, fn_year,
)
from .cr_functions_formatting import fn_numerictext, fn_picture, fn_towords
from .cr_functions_math import fn_abs, fn_cos, fn_exp, fn_fix, fn_int, fn_log, fn_pi, fn_power, fn_remainder, fn_round, fn_sgn, fn_sin, fn_sqrt, fn_truncate
from .cr_functions_predicates import fn_isdate, fn_isnull, fn_isnull_or_empty, fn_isnumber, fn_isstring
from .cr_functions_string import (
    fn_asc, fn_chr, fn_instr, fn_join, fn_lcase, fn_len, fn_left, fn_lowercase, fn_mid,
    fn_propercase, fn_replicatestring, fn_replace, fn_reverse, fn_right, fn_rtrim, fn_space,
    fn_split, fn_strreverse, fn_trim, fn_trimleft, fn_trimright, fn_ucase, fn_ucfirst,
    fn_uppercase, fn_val,
)

_REGISTRY: dict[str, tuple] = {
    "today": (fn_today, 0, 0),
    "now": (fn_now, 0, 0),
    "currentdate": (fn_currentdate, 0, 0),
    "currentdatetime": (fn_currentdatetime, 0, 0),
    "timer": (fn_timer, 0, 0),
    "dateadd": (fn_dateadd, 3, 3),
    "datediff": (fn_datediff, 3, 3),
    "dateserial": (fn_dateserial, 3, 3),
    "datevalue": (fn_datevalue, 1, 1),
    "cdate": (fn_cdate, 1, 1),
    "year": (fn_year, 1, 1),
    "month": (fn_month, 1, 1),
    "day": (fn_day, 1, 1),
    "hour": (fn_hour, 1, 1),
    "minute": (fn_minute, 1, 1),
    "second": (fn_second, 1, 1),
    "dayofweek": (fn_dayofweek, 1, 1),
    "weekdayname": (fn_weekdayname, 1, 2),
    "monthname": (fn_monthname, 1, 2),
    "mid": (fn_mid, 2, 3),
    "left": (fn_left, 2, 2),
    "right": (fn_right, 2, 2),
    "instr": (fn_instr, 2, 3),
    "replace": (fn_replace, 3, 3),
    "split": (fn_split, 1, 2),
    "join": (fn_join, 1, 2),
    "space": (fn_space, 1, 1),
    "chr": (fn_chr, 1, 1),
    "asc": (fn_asc, 1, 1),
    "val": (fn_val, 1, 1),
    "len": (fn_len, 1, 1),
    "trimleft": (fn_trimleft, 1, 1),
    "trimright": (fn_trimright, 1, 1),
    "propercase": (fn_propercase, 1, 1),
    "replicatestring": (fn_replicatestring, 2, 2),
    "reverse": (fn_reverse, 1, 1),
    "uppercase": (fn_uppercase, 1, 1),
    "lowercase": (fn_lowercase, 1, 1),
    "trim": (fn_trim, 1, 1),
    "ucase": (fn_ucase, 1, 1),
    "lcase": (fn_lcase, 1, 1),
    "ltrim": (fn_trimleft, 1, 1),
    "rtrim": (fn_trimright, 1, 1),
    "strreverse": (fn_strreverse, 1, 1),
    "ucfirst": (fn_ucfirst, 1, 1),
    "tonumber": (fn_tonumber, 1, 1),
    "totext": (fn_totext, 1, 3),
    "cbool": (fn_cbool, 1, 1),
    "cstr": (fn_cstr, 1, 1),
    "cdbl": (fn_cdbl, 1, 1),
    "cint": (fn_cint, 1, 1),
    "round": (fn_round, 1, 2),
    "truncate": (fn_truncate, 1, 2),
    "remainder": (fn_remainder, 2, 2),
    "int": (fn_int, 1, 1),
    "fix": (fn_fix, 1, 1),
    "abs": (fn_abs, 1, 1),
    "sgn": (fn_sgn, 1, 1),
    "sqrt": (fn_sqrt, 1, 1),
    "exp": (fn_exp, 1, 1),
    "log": (fn_log, 1, 1),
    "sin": (fn_sin, 1, 1),
    "cos": (fn_cos, 1, 1),
    "pi": (fn_pi, 0, 0),
    "power": (fn_power, 2, 2),
    "numerictext": (fn_numerictext, 1, 2),
    "towords": (fn_towords, 1, 1),
    "picture": (fn_picture, 2, 2),
    "isnull": (fn_isnull, 1, 1),
    "isdate": (fn_isdate, 1, 1),
    "isnumber": (fn_isnumber, 1, 1),
    "isstring": (fn_isstring, 1, 1),
    "isnullorempty": (fn_isnull_or_empty, 1, 1),
    "iif": (fn_iif, 3, 3),
    "choose": (fn_choose, 2, 99),
    "switch": (fn_switch, 2, 99),
    "inrange": (fn_in_range, 3, 3),
    "inlist": (fn_in_list, 2, 99),
}


def call(name: str, args: list) -> Any:
    key = name.lower()
    if key not in _REGISTRY:
        raise KeyError(f"Unknown CR function: {name}")
    fn, min_a, max_a = _REGISTRY[key]
    if len(args) < min_a or len(args) > max_a:
        raise TypeError(f"{name}: expected {min_a}-{max_a} args, got {len(args)}")
    return fn(*args)


def is_cr_function(name: str) -> bool:
    return name.lower() in _REGISTRY


REGISTRY = _REGISTRY
