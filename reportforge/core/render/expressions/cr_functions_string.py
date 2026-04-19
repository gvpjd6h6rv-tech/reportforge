from __future__ import annotations

from typing import Any

from .cr_functions_shared import _to_num, _to_str


def fn_mid(s: Any, start: Any, length: Any = None) -> str:
    s = _to_str(s)
    st = int(_to_num(start)) - 1
    st = max(0, st)
    if length is None:
        return s[st:]
    ln = int(_to_num(length))
    return s[st: st + ln]


def fn_left(s: Any, n: Any) -> str:
    return _to_str(s)[:int(_to_num(n))]


def fn_right(s: Any, n: Any) -> str:
    s = _to_str(s)
    n = int(_to_num(n))
    return s[-n:] if n > 0 else ""


def fn_instr(*args) -> int:
    if len(args) == 2:
        s, sub = _to_str(args[0]), _to_str(args[1])
        start = 1
    else:
        start = int(_to_num(args[0]))
        s, sub = _to_str(args[1]), _to_str(args[2])
    idx = s.find(sub, start - 1)
    return idx + 1 if idx >= 0 else 0


def fn_replace(s: Any, find: Any, replacement: Any) -> str:
    return _to_str(s).replace(_to_str(find), _to_str(replacement))


def fn_split(s: Any, delimiter: Any = " ") -> list:
    return _to_str(s).split(_to_str(delimiter))


def fn_join(arr: Any, delimiter: Any = " ") -> str:
    if isinstance(arr, list):
        return _to_str(delimiter).join(_to_str(x) for x in arr)
    return _to_str(arr)


def fn_space(n: Any) -> str:
    return " " * max(0, int(_to_num(n)))


def fn_chr(n: Any) -> str:
    try:
        return chr(int(_to_num(n)))
    except (ValueError, OverflowError):
        return ""


def fn_asc(s: Any) -> int:
    s = _to_str(s)
    return ord(s[0]) if s else 0


def fn_val(s: Any) -> float:
    s = _to_str(s).strip()
    import re
    m = re.match(r'^[+-]?(\d+\.?\d*|\.\d+)', s)
    if m:
        try:
            return float(m.group())
        except ValueError:
            pass
    return 0.0


def fn_len(s: Any) -> int:
    return len(_to_str(s))


def fn_trimleft(s: Any) -> str:
    return _to_str(s).lstrip()


def fn_trimright(s: Any) -> str:
    return _to_str(s).rstrip()


def fn_propercase(s: Any) -> str:
    return _to_str(s).title()


def fn_replicatestring(s: Any, n: Any) -> str:
    return _to_str(s) * max(0, int(_to_num(n)))


def fn_reverse(s: Any) -> str:
    return _to_str(s)[::-1]


def fn_uppercase(s: Any) -> str:
    return _to_str(s).upper()


def fn_lowercase(s: Any) -> str:
    return _to_str(s).lower()


def fn_trim(s: Any) -> str:
    return _to_str(s).strip()


def fn_ucase(s: Any) -> str:
    return _to_str(s).upper()


def fn_lcase(s: Any) -> str:
    return _to_str(s).lower()


def fn_ltrim(s: Any) -> str:
    return _to_str(s).lstrip()


def fn_rtrim(s: Any) -> str:
    return _to_str(s).rstrip()


def fn_strreverse(s: Any) -> str:
    return _to_str(s)[::-1]


def fn_ucfirst(s: Any) -> str:
    return _to_str(s).capitalize()
