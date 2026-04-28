from __future__ import annotations

import datetime
from typing import Any, Optional

from .formula_ast import VarType

# Lazy import — coercion_logger is optional; never crashes if absent.
try:
    from .coercion_logger import coercion_logger as _coercion_logger
except Exception:  # pragma: no cover
    _coercion_logger = None  # type: ignore[assignment]


def default_for_type(vtype: VarType) -> Any:
    defaults = {
        VarType.NUMBER: 0,
        VarType.CURRENCY: 0.0,
        VarType.STRING: "",
        VarType.BOOLEAN: False,
        VarType.DATE: datetime.date.today(),
        VarType.DATETIME: datetime.datetime.now(),
    }
    return defaults.get(vtype, None)


def truthy(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        return v.lower() not in ("", "false", "0", "no")
    return bool(v)


def to_num(v: Any, *, _field: str = "") -> float:
    if v is None:
        return 0
    if isinstance(v, bool):
        return 1 if v else 0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", ""))
    except Exception:
        if _coercion_logger is not None:
            _coercion_logger.record_mismatch(
                value=v, expected_type="number", result=0, field=_field,
            )
        return 0


def eq(a: Any, b: Any) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    if type(a) == type(b):
        return a == b
    try:
        return float(a) == float(b)
    except Exception:
        return str(a) == str(b)


def cmp(a: Any, b: Any) -> int:
    try:
        fa, fb = float(a), float(b)
        return (fa > fb) - (fa < fb)
    except Exception:
        sa, sb = str(a), str(b)
        return (sa > sb) - (sa < sb)


def parse_date(s: Any, *, _field: str = "") -> Optional[datetime.date]:
    if isinstance(s, (datetime.date, datetime.datetime)):
        return s
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.datetime.strptime(str(s).strip(), fmt).date()
        except Exception:
            pass
    if _coercion_logger is not None:
        _coercion_logger.record_mismatch(
            value=s, expected_type="date", result=None, field=_field,
        )
    return None


def date_part(v: Any, part: str) -> int:
    d = parse_date(v) or datetime.date.today()
    return getattr(d, part, 0)


def to_text(v: Any, decimals: Any = None, date_fmt: str = "%d/%m/%Y") -> str:
    if v is None:
        return ""
    if isinstance(v, float) and decimals is not None:
        return f"{v:.{int(to_num(decimals))}f}"
    if isinstance(v, datetime.date):
        return v.strftime(date_fmt)
    return str(v)


def dateadd(args: list) -> Any:
    if len(args) < 3:
        return None
    interval = str(args[0]).lower()
    n = int(to_num(args[1]))
    d = parse_date(args[2])
    if not d:
        return None
    try:
        if interval in ("d", "day", "days"):
            return d + datetime.timedelta(days=n)
        if interval in ("m", "month", "months"):
            month = d.month - 1 + n
            y = d.year + month // 12
            m = month % 12 + 1
            return d.replace(year=y, month=m)
        if interval in ("y", "year", "years", "yyyy"):
            return d.replace(year=d.year + n)
        if interval in ("h", "hour", "hours"):
            return datetime.datetime.combine(d, datetime.time()) + datetime.timedelta(hours=n)
        if interval in ("n", "min", "minute", "minutes"):
            return datetime.datetime.combine(d, datetime.time()) + datetime.timedelta(minutes=n)
        if interval in ("w", "week", "weeks"):
            return d + datetime.timedelta(weeks=n)
    except Exception:
        pass
    return d


def datediff(args: list) -> int:
    if len(args) < 3:
        return 0
    interval = str(args[0]).lower()
    d1 = parse_date(args[1])
    d2 = parse_date(args[2])
    if not d1 or not d2:
        return 0
    delta = d2 - d1
    if interval in ("d", "day", "days"):
        return delta.days
    if interval in ("w", "week", "weeks"):
        return delta.days // 7
    if interval in ("m", "month", "months"):
        return (d2.year - d1.year) * 12 + (d2.month - d1.month)
    if interval in ("y", "year", "years", "yyyy"):
        return d2.year - d1.year
    if interval in ("h", "hour", "hours"):
        return int(delta.total_seconds()) // 3600
    return delta.days
