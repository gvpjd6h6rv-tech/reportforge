from __future__ import annotations

import datetime
import html as _html
import re

_ROW_ODD = "#FFFFFF"
_ROW_EVEN = "#F4F4F2"
_PT_PX = 1.333
_CHAR_PX = 0.6

def _na(ctx=None, engine=None): return "(no disponible)"

_SPECIAL = {
    "PageNumber": lambda ctx, engine=None: str(ctx.get("page_number", 1)),
    "TotalPages": lambda ctx, engine=None: str(ctx.get("total_pages", 1)),
    "PageNofM": lambda ctx, engine=None: f"Page {ctx.get('page_number', 1)} of {ctx.get('total_pages', 1)}",
    "RecordNumber": lambda ctx, engine=None: str(ctx.get("record_number", 1)),
    "GroupNumber": lambda ctx, engine=None: str(ctx.get("group_number", 1)),
    "PrintDate": lambda ctx, engine=None: ctx.get("print_date", datetime.date.today().strftime("%d/%m/%Y")),
    "PrintTime": lambda ctx, engine=None: ctx.get("print_time", datetime.datetime.now().strftime("%H:%M:%S")),
}

# RF-FIELD-EXPLORER-SPECIAL-FIELDS-PARITY-1: "_special.*" Field Explorer
# aliases: real concept → reuse lambda; no RF backend → "(no disponible)".
for _k, _v in {"page_num": "PageNumber", "total_pages": "TotalPages",
               "record_number": "RecordNumber", "group_number": "GroupNumber",
               "print_date": "PrintDate", "print_time": "PrintTime"}.items():
    _SPECIAL[f"_special.{_k}"] = _SPECIAL[_v]
_SPECIAL["_special.page_n_of_m"] = lambda ctx, engine=None: f"Página {ctx.get('page_number', 1)} de {ctx.get('total_pages', 1)}"
_SPECIAL["_special.horizontal_page_num"] = lambda ctx, engine=None: str(ctx.get("page_number", 1))
_SPECIAL["_special.report_name"] = lambda ctx, engine=None: ctx.get("report_name") or (engine._layout.name if engine is not None else "")
for _k in (
    "file_author", "file_creation_date", "data_date", "data_time",
    "modification_date", "modification_time", "file_path_name",
    "selection_locale", "content_locale", "ce_user_id", "ce_user_name",
    "print_time_zone", "data_time_zone", "ce_user_time_zone",
):
    _SPECIAL[f"_special.{_k}"] = _na
for _k in ("report_comments", "group_selection_formula", "record_selection_formula"):
    _SPECIAL[f"_special.{_k}"] = lambda ctx, engine=None: ""
del _k, _v

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

def _with_element_index(html: str, ctx=None) -> str:
    ctx = ctx or {}
    idx = ctx.get("_index")
    if idx is None or not html.startswith("<"):
        return html
    return re.sub(
        r"^<([A-Za-z0-9:-]+)(\s|>)",
        lambda m: f'<{m.group(1)} data-el-index="{idx}"{m.group(2)}',
        html,
        count=1,
    )
