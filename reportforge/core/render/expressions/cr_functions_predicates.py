from __future__ import annotations

import datetime
from typing import Any

from .cr_functions_shared import _to_str


def fn_isnull(v: Any) -> bool:
    return v is None or v == ""


def fn_isdate(v: Any) -> bool:
    if isinstance(v, (datetime.date, datetime.datetime)):
        return True
    if v is None or v == "":
        return False
    s = str(v).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
                "%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%m/%d/%Y", "%Y%m%d"):
        try:
            datetime.datetime.strptime(s, fmt)
            return True
        except ValueError:
            pass
    return False


def fn_isnumber(v: Any) -> bool:
    if isinstance(v, (int, float)):
        return True
    try:
        float(str(v))
        return True
    except (TypeError, ValueError):
        return False


def fn_isstring(v: Any) -> bool:
    return isinstance(v, str)


def fn_isnull_or_empty(v: Any) -> bool:
    return v is None or _to_str(v).strip() == ""
