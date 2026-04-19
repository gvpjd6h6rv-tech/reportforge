from __future__ import annotations

from typing import Any

from .cr_functions_shared import _to_num, _to_str


def fn_iif(cond: Any, true_val: Any, false_val: Any) -> Any:
    return true_val if bool(cond) else false_val


def fn_choose(index: Any, *values) -> Any:
    idx = int(_to_num(index)) - 1
    if 0 <= idx < len(values):
        return values[idx]
    return ""


def fn_switch(*pairs) -> Any:
    for i in range(0, len(pairs) - 1, 2):
        if bool(pairs[i]):
            return pairs[i + 1]
    return ""


def fn_in_range(v: Any, low: Any, high: Any) -> bool:
    try:
        n = _to_num(v)
        return _to_num(low) <= n <= _to_num(high)
    except Exception:
        s = _to_str(v)
        return _to_str(low) <= s <= _to_str(high)


def fn_in_list(v: Any, *values) -> bool:
    return v in values or _to_str(v) in [_to_str(x) for x in values]
