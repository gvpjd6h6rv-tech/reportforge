# core/render/engines/html_engine.py
# ─────────────────────────────────────────────────────────────────
# WYSIWYG HTML Engine
#
# Lee el Layout (.rfd.json del Designer) y reproduce cada elemento
# en posición absoluta exacta — lo que ves en el Designer es lo
# que sale en el PDF.
#
# Pipeline:
#   Layout + FieldResolver → HtmlEngine.render() → str (HTML A4)
#   → WeasyPrint → PDF
# ─────────────────────────────────────────────────────────────────

from __future__ import annotations
import html as _html
from typing import Optional

from ..resolvers.field_resolver import FieldResolver
from ..resolvers.layout_loader  import Layout, Section, Element


class HtmlEngine:
    """
    Generador HTML WYSIWYG.

    Cada element del Layout se renderiza como <div> con
    position:absolute en las coordenadas exactas del Designer.
    """

    # Alternating row colors for Detail section
    ROW_ODD   = "#FFFFFF"
    ROW_EVEN  = "#F8F6F2"

    def __init__(self, layout: Layout, resolver: FieldResolver,
                 debug: bool = False):
        self._layout   = layout
        self._resolver = resolver
        self._debug    = debug

    # ── Public API ────────────────────────────────────────────────
    def render(self) -> str:
        parts = [
            "<!DOCTYPE html>",
            "<html lang='es'>",
            "<head>",
            "<meta charset='UTF-8'>",
            f"<title>{_esc(self._layout.name)}</title>",
            f"<style>{self._css()}</style>",
            "</head>",
            "<body>",
            self._render_report(),
            "</body>",
            "</html>",
        ]
        return "\n".join(parts)

    # ── CSS ───────────────────────────────────────────────────────
    def _css(self) -> str:
        m  = self._layout.margin_mm
        pw = self._layout.page_width
        debug_css = ".cr-section{outline:1px dashed rgba(255,0,0,.2)}" if self._debug else ""
        return f"""
@page {{
    size: A4;
    margin: {m['top']}mm {m['right']}mm {m['bottom']}mm {m['left']}mm;
    @bottom-center {{
        content: "Página " counter(page) " de " counter(pages);
        font-family: Arial, sans-serif;
        font-size: 7pt;
        color: #888;
    }}
}}
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#000;background:#fff}}
.cr-report{{width:{pw}px;position:relative}}
.cr-section{{
    position:relative;
    width:{pw}px;
    overflow:hidden;
    page-break-inside:avoid
}}
.cr-detail-row{{
    position:relative;
    width:{pw}px;
    overflow:hidden;
    page-break-inside:avoid
}}
.cr-el{{
    position:absolute;
    overflow:hidden;
    display:flex;
    align-items:center;
    line-height:1.1;
    padding:0 1px
}}
.cr-el-inner{{
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    flex:1;
    min-width:0
}}
{debug_css}
"""

    # ── Report ────────────────────────────────────────────────────
    def _render_report(self) -> str:
        r    = self._resolver
        h    = self._layout.total_height()
        parts = [f'<div class="cr-report" style="height:{h}px">']

        for sec in self._layout.sections:
            if sec.is_iterable:
                parts.append(self._render_detail_section(sec))
            else:
                parts.append(self._render_section(sec))

        parts.append("</div>")
        return "\n".join(parts)

    # ── Static section ────────────────────────────────────────────
    def _render_section(self, sec: Section) -> str:
        elements = self._layout.elements_for(sec.id)
        inner    = "".join(self._render_element(el) for el in elements)
        return (f'<div class="cr-section" '
                f'data-section="{sec.id}" data-stype="{sec.stype}" '
                f'style="height:{sec.height}px">'
                f'{inner}'
                f'</div>')

    # ── Detail section (repeats per item) ─────────────────────────
    def _render_detail_section(self, sec: Section) -> str:
        elements = self._layout.elements_for(sec.id)
        items    = self._resolver.items
        if not items:
            return ""
        rows = []
        for idx, item in enumerate(items):
            ri       = self._resolver.with_item(item)
            alt      = idx % 2 == 1
            row_bg   = f'background:{self.ROW_EVEN}' if alt else f'background:{self.ROW_ODD}'
            inner    = "".join(self._render_element(el, ri) for el in elements)
            rows.append(
                f'<div class="cr-detail-row" '
                f'style="height:{sec.height}px;{row_bg}">'
                f'{inner}'
                f'</div>'
            )
        return "\n".join(rows)

    # ── Single element ────────────────────────────────────────────
    def _render_element(self, el: Element,
                        resolver: Optional[FieldResolver] = None) -> str:
        r = resolver or self._resolver

        if el.type == "field":
            return self._render_field(el, r)
        if el.type == "text":
            return self._render_text(el)
        if el.type == "line":
            return self._render_line(el)
        if el.type == "rect":
            return self._render_rect(el)
        if el.type == "image":
            return self._render_image(el)
        return ""

    # ── Field ─────────────────────────────────────────────────────
    def _render_field(self, el: Element, r: FieldResolver) -> str:
        raw_val = r.get(el.fieldPath, "")
        value   = _esc(str(r.get_formatted(el.fieldPath, el.fieldFmt)))
        style   = self._base_style(el)
        return (f'<div class="cr-el" style="{style}">'
                f'<span class="cr-el-inner">{value}</span>'
                f'</div>')

    # ── Text ──────────────────────────────────────────────────────
    def _render_text(self, el: Element) -> str:
        value = _esc(el.content or "")
        style = self._base_style(el)
        return (f'<div class="cr-el" style="{style}">'
                f'<span class="cr-el-inner">{value}</span>'
                f'</div>')

    # ── Line (SVG) ────────────────────────────────────────────────
    def _render_line(self, el: Element) -> str:
        color = el.borderColor if el.borderColor not in ("transparent","") else "#000"
        lw    = max(1, el.lineWidth)
        # Position div
        style = (f"position:absolute;left:{el.x}px;top:{el.y}px;"
                 f"width:{el.w}px;height:{max(el.h, lw)}px;"
                 f"overflow:visible")
        if el.lineDir == "v":
            svg = (f'<svg width="{max(el.w,1)}" height="{el.h}" '
                   f'style="overflow:visible">'
                   f'<line x1="0" y1="0" x2="0" y2="{el.h}" '
                   f'stroke="{color}" stroke-width="{lw}"/>'
                   f'</svg>')
        else:
            mid = max(el.h / 2, lw / 2)
            svg = (f'<svg width="{el.w}" height="{max(el.h, lw)}" '
                   f'style="overflow:visible">'
                   f'<line x1="0" y1="{mid}" x2="{el.w}" y2="{mid}" '
                   f'stroke="{color}" stroke-width="{lw}"/>'
                   f'</svg>')
        return f'<div style="{style}">{svg}</div>'

    # ── Rect ──────────────────────────────────────────────────────
    def _render_rect(self, el: Element) -> str:
        bg  = el.bgColor if el.bgColor != "transparent" else "transparent"
        brd = ""
        if el.borderWidth > 0 and el.borderColor not in ("transparent", ""):
            brd = f"border:{el.borderWidth}px {el.borderStyle} {el.borderColor};"
        style = (f"position:absolute;left:{el.x}px;top:{el.y}px;"
                 f"width:{el.w}px;height:{el.h}px;"
                 f"background:{bg};{brd}"
                 f"box-sizing:border-box;z-index:{el.zIndex}")
        return f'<div style="{style}"></div>'

    # ── Image ─────────────────────────────────────────────────────
    def _render_image(self, el: Element) -> str:
        style = (f"position:absolute;left:{el.x}px;top:{el.y}px;"
                 f"width:{el.w}px;height:{el.h}px;"
                 f"border:1px dashed #AAA;background:#F5F5F5;"
                 f"display:flex;align-items:center;justify-content:center;"
                 f"font-size:7pt;color:#888")
        label = _esc(el.content or "Imagen")
        return f'<div style="{style}">{label}</div>'

    # ── Style builder ─────────────────────────────────────────────
    def _base_style(self, el: Element) -> str:
        bg  = el.bgColor  if el.bgColor  not in ("transparent","") else "transparent"
        brd = ""
        if el.borderWidth > 0 and el.borderColor not in ("transparent",""):
            brd = f"border:{el.borderWidth}px {el.borderStyle} {el.borderColor};"
        return (
            f"position:absolute;"
            f"left:{el.x}px;top:{el.y}px;"
            f"width:{el.w}px;height:{el.h}px;"
            f"font-family:{el.fontFamily},Arial,sans-serif;"
            f"font-size:{el.fontSize}pt;"
            f"font-weight:{'bold' if el.bold else 'normal'};"
            f"font-style:{'italic' if el.italic else 'normal'};"
            f"text-decoration:{'underline' if el.underline else 'none'};"
            f"text-align:{el.align};"
            f"color:{el.color};"
            f"background:{bg};"
            f"{brd}"
            f"overflow:hidden;"
            f"box-sizing:border-box;"
            f"display:flex;align-items:center;padding:0 2px;"
            f"z-index:{el.zIndex};"
            f"line-height:{el.h}px"
        )


# ── Helper ────────────────────────────────────────────────────────
def _esc(s: str) -> str:
    return _html.escape(str(s))
