from __future__ import annotations

import base64
import copy
import math
import re
from pathlib import Path

from .advanced_engine_shared import _CHAR_PX, _PT_PX, _ROW_EVEN, _ROW_ODD, _SPECIAL, _esc
from .barcode_renderer import _render_barcode_svg
from .crosstab_renderer import _render_crosstab


def render_element(engine, el, res, agg=None, ctx=None) -> str:
    ctx = ctx or {}
    agg = agg or engine._agg
    el = _cond(engine, el, res)
    if getattr(el, "suppressIfEmpty", False):
        if not str(element_value(engine, el, res, agg, ctx)).strip():
            return ""
    t = el.type
    if t == "field":
        return render_field(engine, el, res, agg, ctx)
    if t == "text":
        return render_text(engine, el, res, agg)
    if t == "line":
        return render_line(el)
    if t == "rect":
        return render_rect(el)
    if t == "image":
        return render_image(engine, el, res)
    if t == "chart":
        return render_chart(engine, el, res, agg)
    if t == "table":
        return render_table_el(engine, el, res, agg)
    if t == "subreport":
        return render_subreport_el(engine, el, res)
    if t == "barcode":
        return render_barcode(engine, el, res)
    if t == "crosstab":
        return render_crosstab_el(engine, el, res, agg)
    if t == "richtext":
        return render_richtext(engine, el, res)
    return ""


def element_value(engine, el, res, agg, ctx=None) -> str:
    ctx = ctx or {}
    p = el.fieldPath
    if not p:
        return ""
    sp_key = p.strip()
    if sp_key in _SPECIAL:
        return _SPECIAL[sp_key](ctx)
    is_expr = any(c in p for c in ("*", "/", "+", "-", ">", "<", "?", "=", "(", "!"))
    if is_expr:
        gitems = getattr(agg, "_items", None) if agg is not engine._agg else None
        value = engine._ev.eval_expr(p, res, group_items=gitems)
        return _format_value(engine, value, el.fieldFmt)
    return res.get_formatted(p, el.fieldFmt)


def render_field(engine, el, res, agg, ctx=None) -> str:
    return _div(engine, el, element_value(engine, el, res, agg, ctx or {}))


def render_text(engine, el, res, agg) -> str:
    content = el.content or ""
    if engine._ev.contains_expr(content):
        content = engine._ev.eval_text(content, res)
    return _div(engine, el, _esc(content))


def render_line(el) -> str:
    color = el.borderColor if el.borderColor not in ("transparent", "") else "#000"
    lw = max(1, el.lineWidth)
    style = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{max(el.h,lw)}px;overflow:visible"
    if el.lineDir == "v":
        svg = (
            f'<svg width="{max(el.w,1)}" height="{el.h}" style="overflow:visible">'
            f'<line x1="0" y1="0" x2="0" y2="{el.h}" stroke="{color}" stroke-width="{lw}"/>'
            f"</svg>"
        )
    else:
        mid = max(el.h / 2, lw / 2)
        svg = (
            f'<svg width="{el.w}" height="{max(el.h,lw)}" style="overflow:visible">'
            f'<line x1="0" y1="{mid}" x2="{el.w}" y2="{mid}" stroke="{color}" stroke-width="{lw}"/>'
            f"</svg>"
        )
    return f'<div style="{style}">{svg}</div>'


def render_rect(el) -> str:
    bg = el.bgColor if el.bgColor != "transparent" else "transparent"
    brd = (
        f"border:{el.borderWidth}px {el.borderStyle} {el.borderColor};"
        if el.borderWidth > 0 and el.borderColor not in ("transparent", "")
        else ""
    )
    return (
        f'<div style="position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;'
        f'background:{bg};{brd}z-index:{el.zIndex}"></div>'
    )


def render_image(engine, el, res) -> str:
    src = getattr(el, "src", "") or (res.get(el.fieldPath, "") if el.fieldPath else "")
    if src and engine._ev.contains_expr(src):
        src = engine._ev.eval_text(src, res)
    fit = getattr(el, "srcFit", "contain") or "contain"
    style = (
        f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;"
        f"overflow:hidden;z-index:{el.zIndex}"
    )
    if src:
        isrc = _isrc(src)
        return (
            f'<div style="{style}"><img src="{isrc}" style="width:100%;height:100%;object-fit:{fit}" '
            f'alt="{_esc(el.content or "")}"></div>'
        )
    placeholder = (
        f"{style};border:1px dashed #AAA;background:#F5F5F5;display:flex;align-items:center;justify-content:center"
    )
    return (
        f'<div style="{placeholder}"><span style="font-size:6pt;color:#AAA">🖼 Image</span>'
        f'{_esc(el.content or "")}</div>'
    )


def render_chart(engine, el, res, agg) -> str:
    style = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
    try:
        from .chart import render_chart as _render_chart

        spec = {
            "chartType": getattr(el, "chartType", "bar") or "bar",
            "labelField": getattr(el, "labelField", None),
            "valueField": getattr(el, "valueField", None),
            "title": getattr(el, "content", None) or "",
            "width": el.w,
            "height": el.h,
        }
        items = getattr(agg, "_items", None) or engine._items
        img_tag = _render_chart(spec, items, resolver=res)
        return f'<div class="cr-chart" style="{style}">{img_tag}</div>'
    except Exception:
        return (
            f'<div class="cr-chart" style="{style};border:1px dashed #aaa;background:#f9f9f9;display:flex;'
            f'align-items:center;justify-content:center"><span style="font-size:7pt;color:#888">📊 Chart</span></div>'
        )


def render_table_el(engine, el, res, agg) -> str:
    style = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex};overflow:auto"
    try:
        from .table import render_table as _render_table

        items = getattr(agg, "_items", None) or engine._items
        spec = el.__dict__ if hasattr(el, "__dict__") else {}
        html = _render_table(spec, items, res, engine._ev, agg)
        return f'<div class="cr-table" style="{style}">{html}</div>'
    except Exception:
        return (
            f'<div class="cr-table" style="{style};border:1px dashed #aaa;display:flex;align-items:center;'
            f'justify-content:center"><span style="font-size:7pt;color:#888">⊞ Table</span></div>'
        )


def render_subreport_el(engine, el, res) -> str:
    style = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
    try:
        from .subreport import render_subreport as _render_subreport

        spec = el.__dict__ if hasattr(el, "__dict__") else {}
        html = _render_subreport(spec, engine._data, res, engine._ev)
        return f'<div class="cr-subreport" style="{style}">{html}</div>'
    except Exception:
        target = getattr(el, "target", "") or getattr(el, "layoutPath", "") or "subreport"
        return (
            f'<div class="cr-subreport" style="{style};display:flex;align-items:center;justify-content:center">'
            f'<span style="font-size:7pt;color:#777">↗ {_esc(str(target))}</span></div>'
        )


def render_barcode(engine, el, res) -> str:
    style = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
    value = ""
    if el.fieldPath:
        value = str(res.get(el.fieldPath, "") or "")
    if not value:
        value = getattr(el, "content", "") or "RF-BARCODE"
    bc_type = (getattr(el, "barcodeType", None) or "code128").lower()
    show_text = getattr(el, "showText", True)
    svg = _render_barcode_svg(value, bc_type, el.w, el.h, show_text)
    return f'<div class="cr-barcode" style="{style}">{svg}</div>'


def render_crosstab_el(engine, el, res, agg) -> str:
    style = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
    items = getattr(agg, "_items", None) or engine._items
    row_field = getattr(el, "rowField", None) or ""
    col_field = getattr(el, "colField", None) or ""
    val_field = getattr(el, "valueField", None) or getattr(el, "summaryField", None) or ""
    summary = getattr(el, "summary", "sum") or "sum"
    html = _render_crosstab(items, row_field, col_field, val_field, summary)
    return f'<div class="cr-crosstab" style="{style}">{html}</div>'


def render_richtext(engine, el, res) -> str:
    style = (
        f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex};overflow:hidden"
    )
    content = getattr(el, "htmlContent", None) or el.content or ""
    if engine._ev.contains_expr(content):
        content = engine._ev.eval_text(content, res)
    return (
        f'<div style="{style};font-family:{el.fontFamily},Arial,sans-serif;font-size:{el.fontSize}pt">{content}</div>'
    )


def calc_row_height(engine, sec, item) -> int:
    base = sec.height
    res = engine._resolver.with_item(item)
    extra = 0
    for el in engine._layout.elements_for(sec.id):
        if not getattr(el, "canGrow", False):
            continue
        extra = max(extra, _calc_h(engine, el, str(element_value(engine, el, res, engine._agg))) - el.h)
    return base + extra


def _cond(engine, el, res):
    conds = getattr(el, "conditionalStyles", []) or []
    for cond in conds:
        expr = cond.get("condition", "")
        sty = cond.get("style", {})
        if not expr or not sty:
            continue
        try:
            if engine._ev.eval_expr(expr, res):
                patched = copy.copy(el)
                for attr, value in sty.items():
                    try:
                        setattr(patched, attr, value)
                    except AttributeError:
                        pass
                return patched
        except Exception:
            pass
    return el


def _div(engine, el, value) -> str:
    wrap = getattr(el, "wordWrap", False) or getattr(el, "canGrow", False)
    height = _calc_h(engine, el, value) if getattr(el, "canGrow", False) else el.h
    align = "flex-start" if wrap else "center"
    cls = " wrap" if wrap else " nowrap"
    style = _sty(engine, el, height, align)
    return f'<div class="cr-el{cls}" style="{style}"><span class="cr-el-inner">{value}</span></div>'


def _sty(engine, el, h, av="center") -> str:
    bg = el.bgColor if el.bgColor not in ("transparent", "") else "transparent"
    brd = (
        f"border:{el.borderWidth}px {el.borderStyle} {el.borderColor};"
        if el.borderWidth > 0 and el.borderColor not in ("transparent", "")
        else ""
    )
    return (
        f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{h}px;"
        f"font-family:{el.fontFamily},Arial,sans-serif;font-size:{el.fontSize}pt;"
        f"font-weight:{'bold' if el.bold else 'normal'};"
        f"font-style:{'italic' if el.italic else 'normal'};"
        f"text-decoration:{'underline' if el.underline else 'none'};"
        f"text-align:{el.align};color:{el.color};background:{bg};"
        f"{brd}overflow:hidden;box-sizing:border-box;display:flex;align-items:{av};z-index:{el.zIndex}"
    )


def _calc_h(engine, el, value) -> int:
    if not value:
        return el.h
    cw = max(1, int(el.w / max(0.01, el.fontSize * _PT_PX * _CHAR_PX)))
    lh = int(el.fontSize * _PT_PX * 1.4)
    txt = re.sub(r"<[^>]+>", "", value)
    return max(el.h, max(1, math.ceil(len(txt) / cw)) * lh + 4)


def _format_value(engine, value, fmt) -> str:
    if fmt:
        try:
            from ..resolvers.field_resolver import format_value as _fmt
        except ImportError:
            from ..resolvers.field_resolver import _format_value as _fmt
        return _fmt(value, fmt)
    return str(value)


def _isrc(src) -> str:
    if src.startswith(("data:", "http://", "https://", "//")):
        return src
    p = Path(src)
    if p.exists():
        mime = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".webp": "image/webp",
        }.get(p.suffix.lower(), "image/png")
        return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"
    return src
