from __future__ import annotations

import datetime
import html as _html

_ROW_ODD = "#FFFFFF"
_ROW_EVEN = "#F4F4F2"
_PT_PX = 1.333
_CHAR_PX = 0.6

_SPECIAL = {
    "PageNumber": lambda ctx: str(ctx.get("page_number", 1)),
    "TotalPages": lambda ctx: str(ctx.get("total_pages", 1)),
    "PageNofM": lambda ctx: f"Page {ctx.get('page_number', 1)} of {ctx.get('total_pages', 1)}",
    "RecordNumber": lambda ctx: str(ctx.get("record_number", 1)),
    "GroupNumber": lambda ctx: str(ctx.get("group_number", 1)),
    "PrintDate": lambda ctx: ctx.get("print_date", datetime.date.today().strftime("%d/%m/%Y")),
    "PrintTime": lambda ctx: ctx.get("print_time", datetime.datetime.now().strftime("%H:%M:%S")),
}


def _esc(s) -> str:
    return _html.escape(str(s))


def _sk(val):
    try:
        return (0, float(val))
    except Exception:
        return (1, str(val).lower())


def _dig_val(obj, path: str):
    parts = path.split(".")
    value = obj
    for part in parts:
        if isinstance(value, dict):
            value = value.get(part, "")
        else:
            return ""
    return value


def _to_float(v) -> float:
    try:
        return float(v)
    except Exception:
        return 0.0
