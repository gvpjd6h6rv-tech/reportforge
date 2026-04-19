from __future__ import annotations

import html as _html

_ROW_ODD = "#FFFFFF"
_ROW_EVEN = "#F4F4F2"
_PT_PX = 1.333
_CHAR_PX = 0.6


def _esc(s) -> str:
    return _html.escape(str(s))


def _sk(val):
    try:
        return (0, float(val))
    except Exception:
        return (1, str(val).lower())


def _coerce_str(val) -> str:
    if isinstance(val, float):
        return str(int(val)) if val == int(val) else f"{val:.6f}".rstrip("0").rstrip(".")
    if isinstance(val, bool):
        return "Yes" if val else "No"
    return str(val) if val is not None else ""


def _placeholder_el(el, msg: str) -> str:
    return (
        f'<div style="position:absolute;left:{el.x}px;top:{el.y}px;'
        f'width:{el.w}px;height:{el.h}px;background:#FFF3E0;border:1px dashed #FF9800;'
        f'display:flex;align-items:center;justify-content:center;'
        f'font-size:7pt;color:#666;">[{msg}]</div>'
    )

