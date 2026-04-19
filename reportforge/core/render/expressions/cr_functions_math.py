from __future__ import annotations

import math
from typing import Any

from .cr_functions_shared import _to_num


def fn_round(v: Any, decimals: Any = 0) -> float:
    return round(_to_num(v), int(_to_num(decimals)))


def fn_truncate(v: Any, decimals: Any = 0) -> float:
    d = int(_to_num(decimals))
    n = _to_num(v)
    factor = 10 ** d
    return math.trunc(n * factor) / factor


def fn_remainder(a: Any, b: Any) -> float:
    b_val = _to_num(b)
    if b_val == 0:
        return 0.0
    return _to_num(a) % b_val


def fn_int(v: Any) -> int:
    return int(math.floor(_to_num(v)))


def fn_fix(v: Any) -> int:
    return int(math.trunc(_to_num(v)))


def fn_abs(v: Any) -> float:
    return abs(_to_num(v))


def fn_sgn(v: Any) -> int:
    n = _to_num(v)
    return 1 if n > 0 else (-1 if n < 0 else 0)


def fn_sqrt(v: Any) -> float:
    return math.sqrt(max(0, _to_num(v)))


def fn_exp(v: Any) -> float:
    return math.exp(_to_num(v))


def fn_log(v: Any) -> float:
    n = _to_num(v)
    return math.log(n) if n > 0 else 0.0


def fn_sin(v: Any) -> float:
    return math.sin(_to_num(v))


def fn_cos(v: Any) -> float:
    return math.cos(_to_num(v))


def fn_pi() -> float:
    return math.pi


def fn_power(base: Any, exp: Any) -> float:
    return _to_num(base) ** _to_num(exp)
