from __future__ import annotations

import copy

from .advanced_engine_shared import _ROW_EVEN, _ROW_ODD, _SPECIAL, _esc, _with_element_index
from .barcode_renderer import _render_barcode_svg
from .element_embed_renderers import render_chart as _render_chart_el
from .element_embed_renderers import render_subreport_el as _render_subreport_el
from .element_embed_renderers import render_table_el as _render_table_el
from .crosstab_renderer import _render_crosstab
from .element_renderers_assets import _isrc, _barcode_font_source, _image_src_candidates
from .element_style_helpers import render_line, render_rect, _valign_css, _borders_css, _sty, _calc_h, _div


def render_element(engine, el, res, agg=None, ctx=None) -> str:
    ctx = ctx or {}
    agg = agg or engine._agg
    expr = getattr(el, "visibleIf", "") or ""
    if expr:
        try:
            if not engine._ev.eval_expr(expr, res):
                return ""
        except Exception:
            pass
    el = _cond(engine, el, res)
    if getattr(el, "suppressIfEmpty", False):
        if not str(element_value(engine, el, res, agg, ctx)).strip():
            return ""
    t = el.type
    if t == "field":
        return _with_element_index(render_field(engine, el, res, agg, ctx), ctx)
    if t == "text":
        return _with_element_index(render_text(engine, el, res, agg), ctx)
    if t == "line":
        return _with_element_index(render_line(el), ctx)
    if t == "rect":
        return _with_element_index(render_rect(el), ctx)
    if t == "image":
        return _with_element_index(render_image(engine, el, res), ctx)
    if t == "chart":
        return _with_element_index(_render_chart_el(engine, el, res, agg), ctx)
    if t == "table":
        return _with_element_index(_render_table_el(engine, el, res, agg), ctx)
    if t == "subreport":
        return _with_element_index(_render_subreport_el(engine, el, res), ctx)
    if t == "barcode":
        return _with_element_index(render_barcode(engine, el, res), ctx)
    if t == "crosstab":
        return _with_element_index(render_crosstab_el(engine, el, res, agg), ctx)
    if t == "richtext":
        return _with_element_index(render_richtext(engine, el, res), ctx)
    return ""


def _format_number_config(raw_value: object, cfg: dict) -> str:
    """Apply element.format.number config to a raw value. Returns formatted string."""
    if raw_value is None or raw_value == "":
        return ""
    try:
        n = float(str(raw_value).replace(",", "").strip())
    except (ValueError, TypeError):
        return str(raw_value)
    # Zero blank
    zero_cfg = cfg.get("zero") or {}
    if n == 0 and zero_cfg.get("blankIfZero"):
        return ""
    decimals = max(0, min(6, int(cfg.get("decimals", 2))))
    # thousands: explicit wins; parentheses mode implies thousands
    neg_mode = (cfg.get("negative") or {}).get("mode", "minus")
    explicit_th = cfg.get("thousands")
    thousands = explicit_th if explicit_th is not None else (neg_mode == "parentheses")
    is_neg = n < 0
    abs_n = abs(n)
    if thousands:
        formatted = f"{abs_n:,.{decimals}f}"
    else:
        formatted = f"{abs_n:.{decimals}f}"
    # Currency symbol
    cur_cfg = cfg.get("currency") or {}
    if cur_cfg.get("enabled"):
        sym = str(cur_cfg.get("symbol") or "$")
        formatted = sym + " " + formatted
    # Negative sign
    if is_neg:
        if neg_mode == "parentheses":
            formatted = "(" + formatted + ")"
        else:
            formatted = "-" + formatted
    return formatted


def element_value(engine, el, res, agg, ctx=None) -> str:
    ctx = ctx or {}
    p = el.fieldPath
    fmt_num = (getattr(el, "format", None) or {}).get("number")
    if p:
        sp_key = p.strip()
        if sp_key in _SPECIAL:
            return _SPECIAL[sp_key](ctx, engine)
        is_expr = any(c in p for c in ("*", "/", "+", "-", ">", "<", "?", "=", "(", "!"))
        if is_expr:
            gitems = getattr(agg, "_items", None) if agg is not engine._agg else None
            value = engine._ev.eval_expr(p, res, group_items=gitems)
            if fmt_num is not None:
                return _format_number_config(value, fmt_num)
            return _format_value(engine, value, el.fieldFmt)
        if fmt_num is not None:
            raw = res.get(p, "")
            return _format_number_config(raw, fmt_num)
        return res.get_formatted(p, el.fieldFmt)
    content = getattr(el, "content", None)
    if content is not None and content != "":
        return content
    return ""


def render_field(engine, el, res, agg, ctx=None) -> str:
    return _div(engine, el, element_value(engine, el, res, agg, ctx or {}))

def render_text(engine, el, res, agg) -> str:
    content = getattr(el, "content", None)
    content = content if content is not None else ""
    if isinstance(content, str) and engine._ev.contains_expr(content):
        content = engine._ev.eval_text(content, res)
    return _div(engine, el, _esc(str(content)))

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


def render_barcode(engine, el, res) -> str:
    style = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
    value = ""
    if el.fieldPath:
        value = str(res.get(el.fieldPath, "") or "")
    if not value:
        value = str(getattr(el, "content", "") or "")
    if not value:
        # RF-BARCODE-EMPTY-1: a data-bound barcode whose fieldPath is
        # empty/null/missing (and with no explicit content) must NOT fall back
        # to the internal "RF-BARCODE" placeholder -- that leaked a fake code
        # into real fiscal documents (e.g. an empty Clave de Acceso). Render an
        # empty (invisible) box that preserves the layout slot instead.
        return f'<div class="cr-barcode cr-barcode-empty" style="{style}"></div>'
    bc_type = (getattr(el, "barcodeType", None) or "code128").lower()
    show_text = getattr(el, "showText", True)
    font_family = getattr(el, "barcodeFontFamily", "") or ""
    font_size = getattr(el, "barcodeFontSize", 8) or 8
    align = getattr(el, "align", None) or "center"
    if font_family and _barcode_font_source(engine, el, font_family):
        justify = {"left": "flex-start", "right": "flex-end"}.get(align, "center")
        text_style = (
            f"{style};display:flex;align-items:flex-end;justify-content:{justify};"
            f"font-family:'{font_family}';font-size:{font_size}pt;line-height:1;color:#000;overflow:hidden"
        )
        return (
            f'<div class="cr-barcode barcode-font" style="{text_style}">'
            f'<span>{_esc(value)}</span></div>'
        )
    svg = _render_barcode_svg(value, bc_type, el.w, el.h, show_text, align)
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
        if getattr(el, "type", "") == "field" and getattr(el, "fieldPath", None):
            value = str(element_value(engine, el, res, engine._agg))
        else:
            value = getattr(el, "content", None)
        extra = max(extra, _calc_h(engine, el, value) - el.h)
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


def _format_value(engine, value, fmt) -> str:
    if fmt:
        try:
            from ..resolvers.field_resolver import format_value as _fmt
        except ImportError:
            from ..resolvers.field_resolver import _format_value as _fmt
        return _fmt(value, fmt)
    return str(value)
