from __future__ import annotations

import datetime
from typing import Any

# Lazy import — logger is optional; never crashes if absent.
try:
    from .coercion_logger import coercion_logger as _logger
except Exception:  # pragma: no cover
    _logger = None  # type: ignore[assignment]


def _to_num(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        if _logger is not None:
            _logger.record_mismatch(value=v, expected_type="number", result=0.0)
        return 0.0


def _to_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v)


def _to_date(v: Any) -> datetime.date:
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    if v is None or v == "":
        # None/empty → today() is documented behavior; not a mismatch
        return datetime.date.today()
    s = str(v).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
                "%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%m/%d/%Y", "%Y%m%d"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    if _logger is not None:
        _logger.record_mismatch(value=v, expected_type="date", result="today()")
    return datetime.date.today()


def _to_datetime(v: Any) -> datetime.datetime:
    if isinstance(v, datetime.datetime):
        return v
    if isinstance(v, datetime.date):
        return datetime.datetime(v.year, v.month, v.day)
    s = str(v).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S",
                "%d/%m/%Y %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            pass
    if _logger is not None:
        _logger.record_mismatch(value=v, expected_type="datetime", result="now()")
    return datetime.datetime.now()
