# core/render/engines/enterprise_engine.py
# ReportForge Enterprise Engine
# Full Crystal Reports / JasperReports feature parity.
#
# Pipeline:  layout_dict + data → HTML → PDF
# Extends AdvancedHtmlEngine with:
#   - Running totals            - Subreports
#   - Table elements            - Chart elements
#   - Multiple datasets         - Parameters
#   - Styles registry           - visibleIf conditions
#   - keepTogether / pageBreaks - Widows/orphans
#   - Preview mode              - Template variables
from __future__ import annotations
import base64, copy, html as _html, math, re
from itertools import groupby
from pathlib import Path
from typing import Any, Optional

from ..resolvers.layout_loader  import Layout, Section, Element, layout_from_dict
from ..resolvers.field_resolver import FieldResolver, format_value as _fmt
from ..expressions.evaluator    import ExpressionEvaluator
from ..expressions.aggregator   import Aggregator
from ..expressions.running_totals import RunningTotals
from ..pipeline.normalizer      import normalize_layout
from ..styles                   import StyleRegistry, DEFAULT_REGISTRY

try:
    from .chart     import render_chart
    from .table     import render_table
    from .subreport import render_subreport
except ImportError:
    render_chart = render_table = render_subreport = None

_ROW_ODD  = "#FFFFFF"
_ROW_EVEN = "#F4F4F2"
_PT_PX    = 1.333
_CHAR_PX  = 0.6


class EnterpriseEngine:
    """
    ReportForge Enterprise HTML Engine.
    Drop-in replacement for AdvancedHtmlEngine with full feature set.
    """

    def __init__(self, layout_raw: dict, data: Any, *,
                 debug:    bool = False,
                 params:   dict = None,
                 styles:   dict = None,
                 datasets: dict = None,
                 preview:  bool = False,
                 layout_path: Path = None):

        self._debug      = debug
        self._preview    = preview
        self._params     = params or {}
        self._layout_path = layout_path
        self._style_reg  = StyleRegistry(styles) if styles else DEFAULT_REGISTRY

        # ── Normalise layout ──────────────────────────────────────
        norm = normalize_layout(layout_raw)
        self._norm   = norm
        self._layout = layout_from_dict(norm)

        # ── Multiple datasets ─────────────────────────────────────
        self._data = self._resolve_data(data, datasets)

        # ── Primary items list ────────────────────────────────────
        self._items = list(self._data.get("items", []))
        for sr in reversed(norm.get("sortBy", [])):
            f = sr["field"]
            self._items.sort(key=lambda it: _sk(it.get(f, "")),
                             reverse=sr.get("desc", False))

        # ── Resolver / evaluator ──────────────────────────────────
        self._rt       = RunningTotals()
        self._resolver = FieldResolver(self._data)
        self._ev       = ExpressionEvaluator(self._items, self._params, self._rt)
        self._agg      = Aggregator(self._items)
        self._groups   = norm.get("groups", [])

        # ── Page geometry ─────────────────────────────────────────
        m = self._layout.margin_mm
        self._page_h = norm.get("pageHeight", 1123)
        self._mtop   = int(m["top"]    * 3.7795)
        self._mbot   = int(m["bottom"] * 3.7795)

    # ── Public API ────────────────────────────────────────────────
    def render(self) -> str:
        """Full HTML document."""
        css   = self._css()
        title = _esc(self._layout.name)
        body  = self._pages()
        return (f"<!DOCTYPE html>\n<html lang='es'>\n<head>"
                f"<meta charset='UTF-8'><title>{title}</title>"
                f"<style>{css}</style></head>"
                f"\n<body>\n{body}\n</body></html>")

    def render_preview(self) -> str:
        """
        Fast preview mode — returns HTML body without full pagination.
        Ideal for live designer previews.
        """
        self._preview = True
        css  = self._css()
        body = self._pages()
        return (f"<!DOCTYPE html>\n<html lang='es'>\n<head>"
                f"<meta charset='UTF-8'><title>Preview</title>"
                f"<style>{css}</style></head>"
                f"\n<body>\n{body}\n</body></html>")

    # ── CSS ───────────────────────────────────────────────────────
    def _css(self) -> str:
        m  = self._layout.margin_mm
        pw = self._layout.page_width
        dbg = ".cr-section,.cr-detail-row{outline:1px dashed rgba(255,0,0,.15)}" \
              if self._debug else ""
        style_vars = self._style_reg.css_variables()
        page_shadow = ".rpt-page{box-shadow:0 2px 8px rgba(0,0,0,.15);margin:10px auto;}" if self._preview else ""
        page_rule = "" if self._preview else (
            f"@page{{size: {self._norm.get('pageSize','A4')} "
            f"{self._norm.get('orientation','portrait')};"
            f"margin:{m['top']}mm {m['right']}mm {m['bottom']}mm {m['left']}mm;"
            f"@bottom-center{{content:\'Página \'counter(page)\' de \'counter(pages);"
            f"font-family:Arial,sans-serif;font-size:7pt;color:#888}}}}"
        )
        return (
            f"{style_vars}\n"
            f"{page_rule}"
            f"*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}"
            f"body{{font-family:Arial,Helvetica,sans-serif;font-size:8pt;"
            f"color:#000;background:#fff}}"
            f".rpt-page{{width:{pw}px;position:relative;page-break-after:always}}"
            f".rpt-page:last-child{{page-break-after:auto}}"
            f".cr-section{{position:relative;width:{pw}px;overflow:hidden;"
            f"page-break-inside:avoid}}"
            f".cr-section.keep-together{{page-break-inside:avoid}}"
            f".cr-section.break-before{{page-break-before:always}}"
            f".cr-section.break-after{{page-break-after:always}}"
            f".cr-detail-row{{position:relative;width:{pw}px;overflow:hidden;"
            f"page-break-inside:avoid}}"
            f".cr-el{{position:absolute;overflow:hidden;display:flex;padding:0 2px}}"
            f".cr-el-inner{{overflow:hidden;flex:1;min-width:0}}"
            f".wrap .cr-el-inner{{white-space:pre-wrap;word-break:break-word}}"
            f".nowrap .cr-el-inner{{white-space:nowrap;text-overflow:ellipsis}}"
            f"{dbg}"
            f"{page_shadow}"
        )


    # ── Pagination ────────────────────────────────────────────────
    def _pages(self) -> str:
        ph_h   = sum(s.height for s in self._secs("ph"))
        pf_h   = sum(s.height for s in self._secs("pf"))
        rh_h   = sum(s.height for s in self._secs("rh"))
        usable = self._page_h - self._mtop - self._mbot - ph_h - pf_h

        body   = self._body_rows()
        pages  : list[list] = []
        cur    : list       = []
        cy     = float(rh_h)

        for row in body:
            # pageBreakBefore
            if row.get("break_before") and cur:
                pages.append(cur); cur = []; cy = 0.0
            avail = usable - (rh_h if not pages else 0)
            if cy + row["h"] > avail and cur:
                pages.append(cur); cur = []; cy = 0.0
            cur.append(row)
            cy += row["h"]
            # pageBreakAfter
            if row.get("break_after") and cur:
                pages.append(cur); cur = []; cy = 0.0

        pages.append(cur)
        n = len(pages)
        return "\n".join(self._page(rows, i == 0, i == n - 1)
                         for i, rows in enumerate(pages))

    def _body_rows(self) -> list[dict]:
        rows = []
        det  = self._secs("det")

        if not self._groups:
            for i, item in enumerate(self._items):
                self._rt.push(item)
                for s in det:
                    if not self._visible(s, self._resolver.with_item(item)):
                        continue
                    h = self._row_h(s, item)
                    rows.append({
                        "s": s, "item": item, "i": i, "alt": i % 2 == 1,
                        "h": h, "gitems": [], "gval": None, "gtype": "det",
                        "break_before": getattr(s, "pageBreakBefore", False),
                        "break_after":  getattr(s, "pageBreakAfter",  False),
                    })
        else:
            gf     = self._groups[0]["field"]
            sitems = sorted(self._items, key=lambda it: _sk(it.get(gf, "")))
            gi     = 0
            for gval, git in groupby(sitems, key=lambda it: it.get(gf, "")):
                gitems = list(git)
                self._rt.reset_group()

                for s in self._secs_group("gh", 0):
                    if not self._visible(s, self._resolver):
                        continue
                    rows.append({
                        "s": s, "item": gitems[0], "i": gi, "alt": False,
                        "h": s.height, "gitems": gitems, "gval": gval, "gtype": "gh",
                        "break_before": getattr(s, "pageBreakBefore", False),
                        "break_after":  getattr(s, "pageBreakAfter",  False),
                    })
                for di, item in enumerate(gitems):
                    self._rt.push(item)
                    for s in det:
                        if not self._visible(s, self._resolver.with_item(item)):
                            continue
                        rows.append({
                            "s": s, "item": item, "i": di, "alt": di % 2 == 1,
                            "h": self._row_h(s, item),
                            "gitems": gitems, "gval": gval, "gtype": "det",
                            "break_before": False, "break_after": False,
                        })
                for s in self._secs_group("gf", 0):
                    if not self._visible(s, self._resolver):
                        continue
                    rows.append({
                        "s": s, "item": gitems[-1], "i": gi, "alt": False,
                        "h": s.height, "gitems": gitems, "gval": gval, "gtype": "gf",
                        "break_before": False,
                        "break_after":  getattr(s, "pageBreakAfter", False),
                    })
                gi += 1
        return rows

    def _page(self, rows, first: bool, last: bool) -> str:
        pw = self._layout.page_width
        p  = [f'<div class="rpt-page" style="width:{pw}px">']
        if first:
            for s in self._secs("rh"):
                if self._visible(s, self._resolver):
                    p.append(self._static(s))
        for s in self._secs("ph"):
            if self._visible(s, self._resolver):
                p.append(self._static(s))
        for row in rows:
            p.append(self._row(row))
        if last:
            for s in self._secs("rf"):
                if self._visible(s, self._resolver):
                    p.append(self._static(s))
        for s in self._secs("pf"):
            if self._visible(s, self._resolver):
                p.append(self._static(s))
        p.append("</div>")
        return "\n".join(p)

    # ── Row / Section rendering ───────────────────────────────────
    def _row(self, row: dict) -> str:
        s    = row["s"]
        item = row["item"]
        if row["gtype"] in ("gh", "gf"):
            agg = Aggregator(row["gitems"])
            res = self._resolver.with_item(item) if item else self._resolver
            return self._sec(s, res, agg)
        res = self._resolver.with_item(item)
        bg  = _ROW_EVEN if row["alt"] else _ROW_ODD
        sbg = getattr(s, "bgColor", "transparent")
        bgs = f"background:{sbg}" if sbg != "transparent" else f"background:{bg}"
        inner = "".join(self._el(e, res) for e in self._layout.elements_for(s.id))
        return (f'<div class="cr-detail-row" data-stype="det" data-row="{row["i"]}" '
                f'style="height:{row["h"]}px;{bgs}">{inner}</div>')

    def _static(self, s: Section) -> str:
        return self._sec(s, self._resolver, self._agg)

    def _sec(self, s: Section, res: FieldResolver, agg: Aggregator) -> str:
        els  = self._layout.elements_for(s.id)
        # Render all elements
        parts = []
        for e in els:
            if not self._visible_el(e, res):
                continue
            html = self._el(e, res, agg)
            parts.append(html)
        inner = "".join(parts)
        sbg   = getattr(s, "bgColor", "transparent")
        bgs   = f"background:{sbg};" if sbg != "transparent" else ""
        kt    = " keep-together" if getattr(s, "keepTogether", False) else ""
        bb    = " break-before"  if getattr(s, "pageBreakBefore", False) else ""
        ba    = " break-after"   if getattr(s, "pageBreakAfter",  False) else ""
        cls   = f"cr-section{kt}{bb}{ba}"
        return (f'<div class="{cls}" data-section="{s.id}" data-stype="{s.stype}" '
                f'style="height:{s.height}px;{bgs}">{inner}</div>')

    # ── Element rendering ─────────────────────────────────────────
    def _el(self, el: Element, res: FieldResolver, agg: Aggregator = None) -> str:
        agg  = agg or self._agg
        el   = self._apply_style(el)
        el   = self._cond(el, res)

        if getattr(el, "suppressIfEmpty", False):
            if not str(self._val(el, res, agg)).strip():
                return ""

        t = el.type
        if t == "field":     return self._field(el, res, agg)
        if t == "text":      return self._text(el, res, agg)
        if t == "line":      return self._line(el)
        if t == "rect":      return self._rect(el)
        if t == "image":     return self._image(el, res)
        if t == "table":     return self._table_el(el, res, agg)
        if t == "chart":     return self._chart_el(el, res, agg)
        if t == "subreport": return self._subreport_el(el, res)
        return ""

    def _field(self, el: Element, res: FieldResolver, agg: Aggregator) -> str:
        return self._div(el, self._fval(el, res, agg))

    def _fval(self, el: Element, res: FieldResolver, agg: Aggregator) -> str:
        p = el.fieldPath
        if not p:
            return ""
        is_expr = any(c in p for c in ('*', '/', '+', '-', '>', '<', '?', '=', '(', '!'))
        if is_expr or re.search(r'\b(if|sum|count|avg|min|max|runningSum|runningCount|now|uuid|env\.|param\.)', p):
            gitems = getattr(agg, '_items', None) if agg is not self._agg else None
            v = self._ev.eval_expr(p, res, group_items=gitems)
            return _fmt(v, el.fieldFmt) if el.fieldFmt else _coerce_str(v)
        return res.get_formatted(p, el.fieldFmt)

    def _text(self, el: Element, res: FieldResolver, agg: Aggregator) -> str:
        c = el.content or ""
        if self._ev.contains_expr(c):
            gitems = getattr(agg, '_items', None) if agg is not self._agg else None
            c = self._ev.eval_text(c, res, group_items=gitems)
        return self._div(el, _esc(c))

    def _table_el(self, el: Element, res: FieldResolver, agg: Aggregator) -> str:
        if render_table is None:
            return _placeholder_el(el, "table renderer unavailable")
        raw_el  = el.__dict__ if hasattr(el, "__dict__") else {}
        gitems  = getattr(agg, '_items', None)
        items   = gitems if gitems is not None else self._items
        spec    = {**raw_el, "x": el.x, "y": el.y, "w": el.w, "h": el.h}
        # columns stored in el.extra / el as dict
        if not spec.get("columns") and hasattr(el, "columns"):
            spec["columns"] = el.columns
        return render_table(spec, items, res, self._ev, agg, gitems)

    def _chart_el(self, el: Element, res: FieldResolver, agg: Aggregator) -> str:
        if render_chart is None:
            return _placeholder_el(el, "chart renderer unavailable")
        raw = el.__dict__ if hasattr(el, "__dict__") else {}
        spec = {**raw, "x": el.x, "y": el.y,
                "width": el.w, "height": el.h}
        gitems = getattr(agg, '_items', None)
        items  = gitems if gitems is not None else self._items
        return render_chart(spec, items, res)

    def _subreport_el(self, el: Element, res: FieldResolver) -> str:
        if render_subreport is None:
            return _placeholder_el(el, "subreport renderer unavailable")
        raw  = el.__dict__ if hasattr(el, "__dict__") else {}
        spec = {**raw, "x": el.x, "y": el.y, "w": el.w, "h": el.h}
        return render_subreport(spec, self._data, res, self._ev,
                                parent_path=self._layout_path)

    # ── Common element helpers ────────────────────────────────────
    def _div(self, el: Element, value: str) -> str:
        wrap = getattr(el, "wordWrap", False) or getattr(el, "canGrow", False)
        h    = self._calc_h(el, value) if getattr(el, "canGrow", False) else el.h
        av   = "flex-start" if wrap else "center"
        cls  = " wrap" if wrap else " nowrap"
        return (f'<div class="cr-el{cls}" style="{self._sty(el,h,av)}">'
                f'<span class="cr-el-inner">{value}</span></div>')

    def _line(self, el: Element) -> str:
        c  = el.borderColor if el.borderColor not in ("transparent", "") else "#000"
        lw = max(1, el.lineWidth)
        st = (f"position:absolute;left:{el.x}px;top:{el.y}px;"
              f"width:{max(el.w,lw)}px;height:{max(el.h,lw)}px;overflow:visible")
        if el.lineDir == "v":
            svg = (f'<svg width="{max(el.w,1)}" height="{el.h}" style="overflow:visible">'
                   f'<line x1="0" y1="0" x2="0" y2="{el.h}" stroke="{c}" stroke-width="{lw}"/></svg>')
        else:
            mid = max(el.h / 2, lw / 2)
            svg = (f'<svg width="{el.w}" height="{max(el.h,lw)}" style="overflow:visible">'
                   f'<line x1="0" y1="{mid}" x2="{el.w}" y2="{mid}" stroke="{c}" stroke-width="{lw}"/></svg>')
        return f'<div style="{st}">{svg}</div>'

    def _rect(self, el: Element) -> str:
        bg  = el.bgColor if el.bgColor != "transparent" else "transparent"
        brd = (f"border:{el.borderWidth}px {el.borderStyle} {el.borderColor};"
               if el.borderWidth > 0 and el.borderColor not in ("transparent", "") else "")
        return (f'<div style="position:absolute;left:{el.x}px;top:{el.y}px;'
                f'width:{el.w}px;height:{el.h}px;background:{bg};{brd}'
                f'z-index:{el.zIndex}"></div>')

    def _image(self, el: Element, res: FieldResolver) -> str:
        src = getattr(el, "src", "") or (res.get(el.fieldPath, "") if el.fieldPath else "")
        if src and self._ev.contains_expr(src):
            src = self._ev.eval_text(src, res)
        fit = getattr(el, "srcFit", "contain") or "contain"
        st  = (f"position:absolute;left:{el.x}px;top:{el.y}px;"
               f"width:{el.w}px;height:{el.h}px;overflow:hidden;z-index:{el.zIndex}")
        if src:
            isrc = self._isrc(src)
            return (f'<div style="{st}">'
                    f'<img src="{isrc}" style="width:100%;height:100%;object-fit:{fit}" '
                    f'alt="{_esc(el.content or "")}"></div>')
        pst = (f"{st};border:1px dashed #AAA;background:#F5F5F5;display:flex;"
               f"align-items:center;justify-content:center;font-size:7pt;color:#AAA")
        return (f'<div style="{pst}" title="Image placeholder">'
                f'<span style="font-size:6pt;color:#AAA;display:block;text-align:center">'
                f'🖼 Image</span>{_esc(el.content or "")}</div>')

    def _isrc(self, src: str) -> str:
        if src.startswith(("data:", "http://", "https://", "//")):
            return src
        p = Path(src)
        if p.exists():
            mime = {".png": "image/png", ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg", ".gif": "image/gif",
                    ".svg": "image/svg+xml", ".webp": "image/webp"
                    }.get(p.suffix.lower(), "image/png")
            return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"
        return src

    def _sty(self, el: Element, h: int, av: str = "center") -> str:
        bg  = el.bgColor if el.bgColor not in ("transparent", "") else "transparent"
        brd = (f"border:{el.borderWidth}px {el.borderStyle} {el.borderColor};"
               if el.borderWidth > 0 and el.borderColor not in ("transparent", "") else "")
        return (f"position:absolute;left:{el.x}px;top:{el.y}px;"
                f"width:{el.w}px;height:{h}px;"
                f"font-family:{el.fontFamily},Arial,sans-serif;"
                f"font-size:{el.fontSize}pt;"
                f"font-weight:{'bold' if el.bold else 'normal'};"
                f"font-style:{'italic' if el.italic else 'normal'};"
                f"text-decoration:{'underline' if el.underline else 'none'};"
                f"text-align:{el.align};color:{el.color};background:{bg};"
                f"{brd}overflow:hidden;box-sizing:border-box;"
                f"display:flex;align-items:{av};z-index:{el.zIndex}")

    # ── visibleIf / conditional ───────────────────────────────────
    def _visible(self, section: Section, res: FieldResolver) -> bool:
        expr = getattr(section, "visibleIf", "") or ""
        if not expr:
            return True
        try:
            return bool(self._ev.eval_expr(expr, res))
        except Exception:
            return True

    def _visible_el(self, el: Element, res: FieldResolver) -> bool:
        expr = getattr(el, "visibleIf", "") or ""
        if not expr:
            return True
        try:
            return bool(self._ev.eval_expr(expr, res))
        except Exception:
            return True

    def _cond(self, el: Element, res: FieldResolver) -> Element:
        conds = getattr(el, "conditionalStyles", []) or []
        for cond in conds:
            expr = cond.get("condition", "")
            sty  = cond.get("style", {})
            if not expr or not sty:
                continue
            try:
                if self._ev.eval_expr(expr, res):
                    pat = copy.copy(el)
                    for a, v in sty.items():
                        try: setattr(pat, a, v)
                        except AttributeError: pass
                    return pat
            except Exception:
                pass
        return el

    def _apply_style(self, el: Element) -> Element:
        """Apply named style from registry."""
        style_name = getattr(el, "style", "") or getattr(el, "styleName", "")
        if not style_name:
            return el
        props = self._style_reg.resolve(style_name)
        if not props:
            return el
        pat = copy.copy(el)
        for k, v in props.items():
            try:
                if getattr(pat, k, None) in (None, "", 0, False):
                    setattr(pat, k, v)
            except AttributeError:
                pass
        return pat

    # ── Utility ───────────────────────────────────────────────────
    def _calc_h(self, el: Element, value: str) -> int:
        if not value:
            return el.h
        cw  = max(1, int(el.w / max(0.01, el.fontSize * _PT_PX * _CHAR_PX)))
        lh  = int(el.fontSize * _PT_PX * 1.4)
        txt = re.sub(r'<[^>]+>', '', value)
        return max(el.h, max(1, math.ceil(len(txt) / cw)) * lh + 4)

    def _row_h(self, sec: Section, item: dict) -> int:
        base = sec.height
        res  = self._resolver.with_item(item)
        extra = 0
        for el in self._layout.elements_for(sec.id):
            if not getattr(el, "canGrow", False):
                continue
            extra = max(extra, self._calc_h(el, str(self._val(el, res, self._agg))) - el.h)
        return base + extra

    def _val(self, el: Element, res: FieldResolver, agg: Aggregator) -> str:
        if el.type == "field" and el.fieldPath:
            return self._fval(el, res, agg)
        if el.type == "text":
            return el.content or ""
        return ""

    def _secs(self, stype: str) -> list:
        return [s for s in self._layout.sections if s.stype == stype]

    def _secs_group(self, stype: str, gi: int) -> list:
        return [s for s in self._layout.sections
                if s.stype == stype and getattr(s, "groupIndex", 0) == gi]

    # ── Data helpers ──────────────────────────────────────────────
    def _resolve_data(self, data: Any, datasets: dict = None) -> dict:
        from ..datasource import DataSource
        if isinstance(data, str) and (data.startswith("http") or data.endswith(".json")):
            data = DataSource.load(data)
        if not isinstance(data, dict):
            data = {"items": list(data) if hasattr(data, "__iter__") else []}
        if datasets:
            from ..datasource import MultiDataset
            md = MultiDataset(datasets)
            data = {**data, **md.merged()}
        return data


# ── Convenience wrappers ──────────────────────────────────────────
def render_enterprise(layout_raw, data, output_path=None, **kw) -> str:
    import json
    if isinstance(layout_raw, (str, Path)):
        layout_raw = json.loads(Path(layout_raw).read_text(encoding="utf-8"))
    if isinstance(data, (str, Path)):
        data = json.loads(Path(data).read_text(encoding="utf-8"))
    html = EnterpriseEngine(layout_raw, data, **kw).render()
    if output_path:
        Path(output_path).write_text(html, encoding="utf-8")
    return html


def render_preview(layout_raw, data, **kw) -> str:
    """Fast preview — skips PDF, returns HTML instantly."""
    import json
    if isinstance(layout_raw, (str, Path)):
        layout_raw = json.loads(Path(layout_raw).read_text(encoding="utf-8"))
    if isinstance(data, (str, Path)):
        data = json.loads(Path(data).read_text(encoding="utf-8"))
    # Remove any caller-supplied 'preview' key to avoid duplicate kwarg
    kw.pop("preview", None)
    return EnterpriseEngine(layout_raw, data, preview=True, **kw).render_preview()


# ── Helpers ───────────────────────────────────────────────────────
def _esc(s) -> str:
    return _html.escape(str(s))

def _sk(val):
    try:   return (0, float(val))
    except: return (1, str(val).lower())

def _coerce_str(val) -> str:
    if isinstance(val, float):
        return str(int(val)) if val == int(val) else f"{val:.6f}".rstrip("0").rstrip(".")
    if isinstance(val, bool):
        return "Yes" if val else "No"
    return str(val) if val is not None else ""

def _placeholder_el(el, msg: str) -> str:
    return (f'<div style="position:absolute;left:{el.x}px;top:{el.y}px;'
            f'width:{el.w}px;height:{el.h}px;background:#FFF3E0;border:1px dashed #FF9800;'
            f'display:flex;align-items:center;justify-content:center;'
            f'font-size:7pt;color:#666;">[{msg}]</div>')

# Backward-compatibility alias
EnterpriseHtmlEngine = EnterpriseEngine
