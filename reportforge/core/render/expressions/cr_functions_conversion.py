from __future__ import annotations

from typing import Any

from .cr_functions_shared import _to_num, _to_str


def fn_tonumber(v: Any) -> float:
    return _to_num(v)


def fn_totext(v: Any, decimals: Any = None, separator: Any = ",") -> str:
    if decimals is None:
        n = _to_num(v)
        return str(int(n)) if n == int(n) else f"{n:.6f}".rstrip("0").rstrip(".")
    d = int(_to_num(decimals))
    n = _to_num(v)
    sep = _to_str(separator)
    if sep == ",":
        fmt = f"{{:,.{d}f}}"
    else:
        fmt = f"{{:.{d}f}}"
    return fmt.format(n)


def fn_cbool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = _to_str(v).strip().lower()
    return s in ("true", "yes", "1", "on")


def fn_cstr(v: Any) -> str:
    return _to_str(v)


def fn_cdbl(v: Any) -> float:
    return _to_num(v)


def fn_cint(v: Any) -> int:
    return int(_to_num(v))
