# core/render/engines/element_style_helpers.py
# Pure style/geometry helpers for element_renderers.py — extracted verbatim
# (no behavior change) to keep that file under its governance line-count
# threshold. Re-imported by element_renderers.py so `from .element_renderers
# import _calc_h` (used elsewhere, e.g. enterprise_engine_layout.py) keeps
# working unchanged.
from __future__ import annotations

import math
import re

from .advanced_engine_shared import _CHAR_PX, _PT_PX


def render_line(el) -> str:
    color = el.borderColor if el.borderColor not in ("transparent", "") else "#000"
    # max(1, ...) clamped an explicit lineWidth=0 (Gate 1: 0 must hide the
    # line) back up to 1 — 0 is a valid, renderable width (a 0px CSS border
    # paints nothing), it just isn't a *minimum*.
    lw = max(0, el.lineWidth)
    # PARITY-AUDIT-1: was an SVG <line> with overflow:visible. Proven live
    # (geometry diff=0.0 vs expected pos; elementFromPoint + full-tree rect
    # scan found no element over the visible-stroke pixels): under the
    # preview viewport's transform:scale(zoom), Chromium painted this SVG's
    # stroke bleeding into the text row below — a paint-layer artifact, not
    # a layout bug. overflow:hidden made it vanish (painted outside its own
    # box), confirming it. Replaced with a CSS border (no such raster
    # ambiguity), centered like design's SVG mid=h/2 convention
    # (CanvasLayoutElements.js:115) to avoid a new divergence. Centering
    # offset is rounded to an integer px — a fractional one anti-aliases a
    # 1px ink fringe just outside the box (caught by the raster smoke test).
    # Missing lineDir used to always default horizontal (matching CanvasLayoutElements.js fix).
    is_vertical = el.lineDir == "v" or (not el.lineDir and el.h > el.w)
    if is_vertical:
        left = el.x + round((el.w - lw) / 2)
        style = f"position:absolute;left:{left}px;top:{el.y}px;width:{lw}px;height:{el.h}px;border-left:{lw}px solid {color};box-sizing:border-box"
    else:
        top = el.y + round((el.h - lw) / 2)
        style = f"position:absolute;left:{el.x}px;top:{top}px;width:{el.w}px;height:{lw}px;border-top:{lw}px solid {color};box-sizing:border-box"
    return f'<div style="{style}"></div>'


def render_rect(el) -> str:
    bg = el.bgColor if el.bgColor != "transparent" else "transparent"
    # format.borders (Format Editor) takes precedence over the flat
    # borderWidth/borderColor/borderStyle when present, matching both
    # _sty() below (field/text) and CanvasLayoutElements.js's _setBorder() —
    # render_rect used to be the one place that always ignored format.borders,
    # so a rect with it set rendered completely differently in Design vs here.
    fmt_borders = (getattr(el, "format", None) or {}).get("borders")
    if fmt_borders:
        brd = _borders_css(fmt_borders)
    else:
        brd = (
            f"border:{el.borderWidth}px {el.borderStyle} {el.borderColor};"
            if el.borderWidth > 0 and el.borderColor not in ("transparent", "")
            else ""
        )
    return (
        f'<div style="position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;'
        f'background:{bg};{brd}z-index:{el.zIndex}"></div>'
    )


def _valign_css(valign: object) -> str:
    """Map el.valign string to CSS align-items value. Pure function, no side effects."""
    return {"top": "flex-start", "middle": "center", "bottom": "flex-end"}.get(
        str(valign).lower() if valign else "", "center"
    )


def _borders_css(cfg: dict) -> str:
    """Convert format.borders config to per-side CSS border properties."""
    style = cfg.get("style", "solid")
    color = cfg.get("color", "#000000")
    width = int(cfg.get("width", 1))
    parts = []
    for side, prop in [("top", "border-top"), ("right", "border-right"),
                       ("bottom", "border-bottom"), ("left", "border-left")]:
        if cfg.get(side):
            parts.append(f"{prop}:{width}px {style} {color};")
    return "".join(parts)


def _sty(engine, el, h, av="center") -> str:
    bg = el.bgColor if el.bgColor not in ("transparent", "") else "transparent"
    fmt_borders = (getattr(el, "format", None) or {}).get("borders")
    if fmt_borders:
        brd = _borders_css(fmt_borders)
    else:
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
    if value is None or value == "":
        return el.h
    cw = max(1, int(el.w / max(0.01, el.fontSize * _PT_PX * _CHAR_PX)))
    lh = int(el.fontSize * _PT_PX * 1.4)
    txt = re.sub(r"<[^>]+>", "", str(value))
    return max(el.h, max(1, math.ceil(len(txt) / cw)) * lh + 4)


def _explicit_line_break_attr(value, wrap: bool) -> str:
    """Preserve authored CR/LF line breaks without enabling automatic wrapping."""
    if wrap or value is None:
        return ""
    text = str(value)
    return ' style="white-space:pre"' if "\n" in text or "\r" in text else ""


def _div(engine, el, value) -> str:
    wrap = getattr(el, "wordWrap", False) or getattr(el, "canGrow", False)
    height = _calc_h(engine, el, value) if getattr(el, "canGrow", False) else el.h
    el_type = getattr(el, "type", "")
    if el_type in ("field", "text"):
        av = _valign_css(getattr(el, "valign", None) or None)
    else:
        av = "flex-start" if wrap else "center"
    cls = " wrap" if wrap else " nowrap"
    style = _sty(engine, el, height, av)
    inner_attr = _explicit_line_break_attr(value, wrap)
    return f'<div class="cr-el{cls}" style="{style}"><span class="cr-el-inner"{inner_attr}>{value}</span></div>'
