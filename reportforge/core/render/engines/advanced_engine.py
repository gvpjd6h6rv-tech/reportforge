# core/render/engines/advanced_engine.py
# ReportForge Advanced HTML Engine — Phase 2 upgrade
# Pipeline: layout_dict + data → HTML (absolute positioned) → WeasyPrint → PDF
from __future__ import annotations
import base64, html as _html, math, re, copy, datetime
from itertools import groupby
from pathlib import Path
from typing import Any

from ..resolvers.layout_loader  import Layout, Section, Element, layout_from_dict
from ..resolvers.field_resolver import FieldResolver
from ..expressions.evaluator    import ExpressionEvaluator
from ..expressions.aggregator   import Aggregator
from ..pipeline.normalizer      import normalize_layout

try:
    from ..resolvers.field_resolver import format_value as _fmt
except ImportError:
    from ..resolvers.field_resolver import _format_value as _fmt

_ROW_ODD = "#FFFFFF"; _ROW_EVEN = "#F4F4F2"
_PT_PX = 1.333; _CHAR_PX = 0.6

# ── Special field values (set at render time) ─────────────────────────────
_SPECIAL = {
    "PageNumber":  lambda ctx: str(ctx.get("page_number", 1)),
    "TotalPages":  lambda ctx: str(ctx.get("total_pages", 1)),
    "PageNofM":    lambda ctx: f"Page {ctx.get('page_number',1)} of {ctx.get('total_pages',1)}",
    "RecordNumber":lambda ctx: str(ctx.get("record_number", 1)),
    "GroupNumber": lambda ctx: str(ctx.get("group_number", 1)),
    "PrintDate":   lambda ctx: ctx.get("print_date", datetime.date.today().strftime("%d/%m/%Y")),
    "PrintTime":   lambda ctx: ctx.get("print_time", datetime.datetime.now().strftime("%H:%M:%S")),
}


class AdvancedHtmlEngine:
    def __init__(self, layout_raw, data, debug=False, alt_colors=True):
        self._data = data; self._debug = debug
        norm = normalize_layout(layout_raw)
        self._layout = layout_from_dict(norm); self._norm = norm
        self._items = list(data.get("items", []))
        for sr in reversed(norm.get("sortBy", [])):
            f = sr["field"]
            self._items.sort(key=lambda it: _sk(it.get(f,"")), reverse=sr.get("desc",False))
        self._resolver = FieldResolver(data)
        self._ev = ExpressionEvaluator(self._items)
        self._agg = Aggregator(self._items)
        self._groups = norm.get("groups", [])
        m = self._layout.margin_mm
        self._page_h = norm.get("pageHeight", 1123)
        self._mtop = int(m["top"]*3.7795); self._mbot = int(m["bottom"]*3.7795)
        self._print_date = datetime.date.today().strftime("%d/%m/%Y")
        self._print_time = datetime.datetime.now().strftime("%H:%M:%S")

    def render(self) -> str:
        css = self._css(); title = _esc(self._layout.name)
        return (f"<!DOCTYPE html>\n<html lang='es'>\n<head><meta charset='UTF-8'>"
                f"<title>{title}</title><style>{css}</style></head>"
                f"<body>\n{self._pages()}\n</body></html>")

    def _css(self) -> str:
        m = self._layout.margin_mm; pw = self._layout.page_width
        dbg = ".cr-section,.cr-detail-row{outline:1px dashed rgba(255,0,0,.15)}" if self._debug else ""
        return (f"@page{{size: {self._norm.get('pageSize','A4')} {self._norm.get('orientation','portrait')};"
                f"margin:{m['top']}mm {m['right']}mm {m['bottom']}mm {m['left']}mm;"
                f"@bottom-center{{content:'Página 'counter(page)' de 'counter(pages);"
                f"font-family:Arial,sans-serif;font-size:7pt;color:#888}}}}"
                f"*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}"
                f"body{{font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#000;background:#fff}}"
                f".rpt-page{{width:{pw}px;position:relative;page-break-after:always}}"
                f".rpt-page:last-child{{page-break-after:auto}}"
                f".cr-section{{position:relative;width:{pw}px;overflow:hidden;page-break-inside:avoid}}"
                f".cr-detail-row{{position:relative;width:{pw}px;overflow:hidden;page-break-inside:avoid}}"
                f".cr-el{{position:absolute;overflow:hidden;display:flex;padding:0 2px}}"
                f".cr-el-inner{{overflow:hidden;flex:1;min-width:0}}"
                f".wrap .cr-el-inner{{white-space:pre-wrap;word-break:break-word}}"
                f".nowrap .cr-el-inner{{white-space:nowrap;text-overflow:ellipsis}}"
                f".cr-chart{{position:absolute;overflow:hidden}}"
                f".cr-table{{position:absolute;overflow:hidden;font-size:8pt}}"
                f".cr-table table{{border-collapse:collapse;width:100%}}"
                f".cr-table td,.cr-table th{{border:1px solid #ccc;padding:1px 3px;font-size:7.5pt}}"
                f".cr-table th{{background:#e8e8e8;font-weight:bold}}"
                f".cr-crosstab{{position:absolute;overflow:auto}}"
                f".cr-crosstab table{{border-collapse:collapse;font-size:7pt}}"
                f".cr-crosstab td,.cr-crosstab th{{border:1px solid #bbb;padding:1px 4px}}"
                f".cr-crosstab th{{background:#d0d8e8;font-weight:bold}}"
                f".cr-barcode{{position:absolute;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center}}"
                f".cr-subreport{{position:absolute;overflow:hidden;border:1px dashed #999;background:#fafafa}}"
                f"{dbg}")

    def _pages(self) -> str:
        ph_h = sum(s.height for s in self._secs("ph"))
        pf_h = sum(s.height for s in self._secs("pf"))
        rh_h = sum(s.height for s in self._secs("rh"))
        usable = self._page_h - self._mtop - self._mbot - ph_h - pf_h
        body = self._body_rows()
        pages: list[list] = []; cur: list = []; cy = float(rh_h)
        for row in body:
            # newPageBefore / keepTogether handling
            sec = row["s"]
            force_break = getattr(sec, "newPageBefore", False)
            keep = getattr(sec, "keepTogether", False)
            avail = usable - (rh_h if not pages else 0)
            row_h = row["h"]
            if (force_break and cur) or (cy + row_h > avail and cur):
                pages.append(cur); cur = []; cy = 0.0
            cur.append(row); cy += row_h
        pages.append(cur)
        # Compute total pages for special fields
        total_pages = len(pages)
        return "\n".join(
            self._page(rows, i==0, i==len(pages)-1, i+1, total_pages)
            for i, rows in enumerate(pages)
        )

    def _body_rows(self) -> list[dict]:
        rows = []; det = self._secs("det")
        if not self._groups:
            for i, item in enumerate(self._items):
                prev_item = self._items[i-1] if i > 0 else None
                next_item = self._items[i+1] if i < len(self._items)-1 else None
                for s in det:
                    if self._suppress_section(s, self._resolver.with_item(item)):
                        continue
                    rows.append({"s":s,"item":item,"i":i,"alt":i%2==1,
                                 "h":self._row_h(s,item),
                                 "gitems":[],"gval":None,"gtype":"det",
                                 "record_number":i+1,
                                 "prev":prev_item,"next":next_item})
        else:
            rows = self._body_rows_grouped(self._items, self._groups, 0, det)
        return rows

    def _body_rows_grouped(self, items, groups, level, det_secs, parent_gitems=None):
        rows = []
        if not groups:
            for di, item in enumerate(items):
                for s in det_secs:
                    if self._suppress_section(s, self._resolver.with_item(item)):
                        continue
                    rows.append({"s":s,"item":item,"i":di,"alt":di%2==1,
                                 "h":self._row_h(s,item),
                                 "gitems":parent_gitems or items,
                                 "gval":None,"gtype":"det","record_number":di+1})
            return rows
        gf = groups[0]["field"]
        go = groups[0].get("order","ASC").upper()
        sorted_items = sorted(items, key=lambda it: _sk(it.get(gf,"")),
                              reverse=(go == "DESC"))
        gi = 0
        for gval, git in groupby(sorted_items, key=lambda it: it.get(gf,"")):
            gitems = list(git)
            # Group Header
            for s in self._secs_group("gh", level):
                if not self._suppress_section(s, self._resolver.with_item(gitems[0])):
                    rows.append({"s":s,"item":gitems[0],"i":gi,"alt":False,
                                 "h":s.height,"gitems":gitems,
                                 "gval":gval,"gtype":"gh","group_number":gi+1})
            # Detail (recurse for sub-groups)
            sub_rows = self._body_rows_grouped(gitems, groups[1:], level+1, det_secs, gitems)
            rows.extend(sub_rows)
            # Group Footer
            for s in self._secs_group("gf", level):
                if not self._suppress_section(s, self._resolver.with_item(gitems[-1])):
                    rows.append({"s":s,"item":gitems[-1],"i":gi,"alt":False,
                                 "h":s.height,"gitems":gitems,
                                 "gval":gval,"gtype":"gf","group_number":gi+1})
            gi += 1
        return rows

    def _suppress_section(self, sec, res) -> bool:
        """Evaluate suppress formula on a section."""
        sf = getattr(sec, "suppressFormula", None) or getattr(sec, "suppress", None)
        if not sf or not isinstance(sf, str):
            return bool(sf) if sf else False
        sf = sf.strip()
        # Handle literal booleans
        if sf.lower() in ("true", "1", "yes"):  return True
        if sf.lower() in ("false", "0", "no", ""):  return False
        try:
            return bool(self._ev.eval_expr(sf, res))
        except Exception:
            return False

    def _page(self, rows, first, last, page_num, total_pages) -> str:
        pw = self._layout.page_width
        ctx = {"page_number": page_num, "total_pages": total_pages,
               "print_date": self._print_date, "print_time": self._print_time}
        p = [f'<div class="rpt-page" style="width:{pw}px">']
        if first:
            for s in self._secs("rh"): p.append(self._static(s, ctx))
        for s in self._secs("ph"): p.append(self._static(s, ctx))
        for row in rows: p.append(self._row(row, ctx))
        if last:
            for s in self._secs("rf"): p.append(self._static(s, ctx))
        for s in self._secs("pf"): p.append(self._static(s, ctx))
        p.append("</div>"); return "\n".join(p)

    def _row(self, row, ctx=None) -> str:
        ctx = ctx or {}
        s = row["s"]; item = row["item"]
        ctx = dict(ctx)
        ctx["record_number"] = row.get("record_number", 1)
        ctx["group_number"]  = row.get("group_number", 1)
        if row["gtype"] in ("gh","gf"):
            agg = Aggregator(row["gitems"])
            res = self._resolver.with_item(item) if item else self._resolver
            return self._sec(s, res, agg, ctx)
        res = self._resolver.with_item(item)
        bg  = _ROW_EVEN if row["alt"] else _ROW_ODD
        sbg = getattr(s,"bgColor","transparent")
        bgs = f"background:{sbg}" if sbg != "transparent" else f"background:{bg}"
        inner = "".join(self._el(e, res, self._agg, ctx) for e in self._layout.elements_for(s.id))
        return f'<div class="cr-detail-row" data-stype="det" data-row="{row["i"]}" style="height:{row["h"]}px;{bgs}">{inner}</div>'

    def _static(self, s, ctx=None) -> str:
        return self._sec(s, self._resolver, self._agg, ctx or {})

    def _sec(self, s, res, agg, ctx=None) -> str:
        ctx = ctx or {}
        els = self._layout.elements_for(s.id)
        inner = "".join(self._el(e, res, agg, ctx) for e in els)
        sbg = getattr(s,"bgColor","transparent")
        bgs = f"background:{sbg};" if sbg != "transparent" else ""
        return (f'<div class="cr-section" data-section="{s.id}" data-stype="{s.stype}" '
                f'style="height:{s.height}px;{bgs}">{inner}</div>')

    def _el(self, el, res, agg=None, ctx=None) -> str:
        ctx = ctx or {}
        agg = agg or self._agg
        el  = self._cond(el, res)
        # suppressIfEmpty
        if getattr(el,"suppressIfEmpty",False):
            if not str(self._val(el,res,agg)).strip(): return ""
        # Element type dispatch
        t = el.type
        if t == "field":      return self._field(el, res, agg, ctx)
        if t == "text":       return self._text(el, res, agg)
        if t == "line":       return self._line(el)
        if t == "rect":       return self._rect(el)
        if t == "image":      return self._image(el, res)
        if t == "chart":      return self._chart(el, res, agg)
        if t == "table":      return self._table_el(el, res, agg)
        if t == "subreport":  return self._subreport_el(el, res)
        if t == "barcode":    return self._barcode(el, res)
        if t == "crosstab":   return self._crosstab(el, res, agg)
        if t == "richtext":   return self._richtext(el, res)
        return ""

    def _field(self, el, res, agg, ctx=None) -> str:
        return self._div(el, self._fval(el, res, agg, ctx or {}))

    def _fval(self, el, res, agg, ctx=None) -> str:
        ctx = ctx or {}
        p = el.fieldPath
        if not p: return ""
        # Special fields
        sp_key = p.strip()
        if sp_key in _SPECIAL:
            return _SPECIAL[sp_key](ctx)
        is_expr = any(c in p for c in ('*','/','+','-','>','<','?','=','(','!'))
        if is_expr:
            gitems = getattr(agg, '_items', None) if agg is not self._agg else None
            v = self._ev.eval_expr(p, res, group_items=gitems)
            return _fmt(v, el.fieldFmt) if el.fieldFmt else str(v)
        return res.get_formatted(p, el.fieldFmt)

    def _text(self, el, res, agg) -> str:
        c = el.content or ""
        if self._ev.contains_expr(c): c = self._ev.eval_text(c, res)
        return self._div(el, _esc(c))

    def _div(self, el, value) -> str:
        wrap = getattr(el,"wordWrap",False) or getattr(el,"canGrow",False)
        h    = self._calc_h(el,value) if getattr(el,"canGrow",False) else el.h
        av   = "flex-start" if wrap else "center"
        cls  = " wrap" if wrap else " nowrap"
        st   = self._sty(el,h,av)
        return f'<div class="cr-el{cls}" style="{st}"><span class="cr-el-inner">{value}</span></div>'

    def _line(self, el) -> str:
        c = el.borderColor if el.borderColor not in ("transparent","") else "#000"
        lw = max(1, el.lineWidth)
        st = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{max(el.h,lw)}px;overflow:visible"
        if el.lineDir == "v":
            svg = f'<svg width="{max(el.w,1)}" height="{el.h}" style="overflow:visible"><line x1="0" y1="0" x2="0" y2="{el.h}" stroke="{c}" stroke-width="{lw}"/></svg>'
        else:
            mid = max(el.h/2, lw/2)
            svg = f'<svg width="{el.w}" height="{max(el.h,lw)}" style="overflow:visible"><line x1="0" y1="{mid}" x2="{el.w}" y2="{mid}" stroke="{c}" stroke-width="{lw}"/></svg>'
        return f'<div style="{st}">{svg}</div>'

    def _rect(self, el) -> str:
        bg  = el.bgColor if el.bgColor != "transparent" else "transparent"
        brd = f"border:{el.borderWidth}px {el.borderStyle} {el.borderColor};" if el.borderWidth > 0 and el.borderColor not in ("transparent","") else ""
        return f'<div style="position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;background:{bg};{brd}z-index:{el.zIndex}"></div>'

    def _image(self, el, res) -> str:
        src = getattr(el,"src","") or (res.get(el.fieldPath,"") if el.fieldPath else "")
        if src and self._ev.contains_expr(src): src = self._ev.eval_text(src, res)
        fit = getattr(el,"srcFit","contain") or "contain"
        st  = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;overflow:hidden;z-index:{el.zIndex}"
        if src:
            isrc = self._isrc(src)
            return f'<div style="{st}"><img src="{isrc}" style="width:100%;height:100%;object-fit:{fit}" alt="{_esc(el.content or "")}"></div>'
        pst = f"{st};border:1px dashed #AAA;background:#F5F5F5;display:flex;align-items:center;justify-content:center"
        return f'<div style="{pst}"><span style="font-size:6pt;color:#AAA">🖼 Image</span>{_esc(el.content or "")}</div>'

    def _isrc(self, src) -> str:
        if src.startswith(("data:","http://","https://","//")): return src
        p = Path(src)
        if p.exists():
            mime = {".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",
                    ".gif":"image/gif",".svg":"image/svg+xml",".webp":"image/webp"}.get(p.suffix.lower(),"image/png")
            return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"
        return src

    # ── NEW: Chart element ───────────────────────────────────────────────
    def _chart(self, el, res, agg) -> str:
        st = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
        try:
            from .chart import render_chart
            spec = {
                "chartType":   getattr(el, "chartType", "bar") or "bar",
                "labelField":  getattr(el, "labelField", None),
                "valueField":  getattr(el, "valueField", None),
                "title":       getattr(el, "content", None) or "",
                "width":       el.w,
                "height":      el.h,
            }
            items = getattr(agg, '_items', None) or self._items
            img_tag = render_chart(spec, items, resolver=res)
            return f'<div class="cr-chart" style="{st}">{img_tag}</div>'
        except Exception as exc:
            return f'<div class="cr-chart" style="{st};border:1px dashed #aaa;background:#f9f9f9;display:flex;align-items:center;justify-content:center"><span style="font-size:7pt;color:#888">📊 Chart</span></div>'

    # ── NEW: Table element ───────────────────────────────────────────────
    def _table_el(self, el, res, agg) -> str:
        st = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex};overflow:auto"
        try:
            from .table import render_table
            items = getattr(agg, '_items', None) or self._items
            spec = el.__dict__ if hasattr(el, '__dict__') else {}
            html = render_table(spec, items, res, self._ev, agg)
            return f'<div class="cr-table" style="{st}">{html}</div>'
        except Exception:
            return f'<div class="cr-table" style="{st};border:1px dashed #aaa;display:flex;align-items:center;justify-content:center"><span style="font-size:7pt;color:#888">⊞ Table</span></div>'

    # ── NEW: Subreport element ───────────────────────────────────────────
    def _subreport_el(self, el, res) -> str:
        st = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
        try:
            from .subreport import render_subreport
            spec = el.__dict__ if hasattr(el, '__dict__') else {}
            html = render_subreport(spec, self._data, res, self._ev)
            return f'<div class="cr-subreport" style="{st}">{html}</div>'
        except Exception:
            target = getattr(el, "target", "") or getattr(el, "layoutPath", "") or "subreport"
            return f'<div class="cr-subreport" style="{st};display:flex;align-items:center;justify-content:center"><span style="font-size:7pt;color:#777">↗ {_esc(str(target))}</span></div>'

    # ── NEW: Barcode element ─────────────────────────────────────────────
    def _barcode(self, el, res) -> str:
        st = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
        value = ""
        if el.fieldPath:
            value = str(res.get(el.fieldPath, "") or "")
        if not value:
            value = getattr(el, "content", "") or "RF-BARCODE"
        bc_type = (getattr(el, "barcodeType", None) or "code128").lower()
        show_text = getattr(el, "showText", True)
        svg = _render_barcode_svg(value, bc_type, el.w, el.h, show_text)
        return f'<div class="cr-barcode" style="{st}">{svg}</div>'

    # ── NEW: Crosstab element ────────────────────────────────────────────
    def _crosstab(self, el, res, agg) -> str:
        st = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
        items = getattr(agg, '_items', None) or self._items
        row_field = getattr(el, "rowField", None) or ""
        col_field = getattr(el, "colField", None) or ""
        val_field = getattr(el, "valueField", None) or getattr(el, "summaryField", None) or ""
        summary   = getattr(el, "summary", "sum") or "sum"
        html = _render_crosstab(items, row_field, col_field, val_field, summary)
        return f'<div class="cr-crosstab" style="{st}">{html}</div>'

    # ── NEW: Richtext element ────────────────────────────────────────────
    def _richtext(self, el, res) -> str:
        st = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex};overflow:hidden"
        content = getattr(el, "htmlContent", None) or el.content or ""
        if self._ev.contains_expr(content):
            content = self._ev.eval_text(content, res)
        return f'<div style="{st};font-family:{el.fontFamily},Arial,sans-serif;font-size:{el.fontSize}pt">{content}</div>'

    def _cond(self, el, res) -> Element:
        conds = getattr(el,"conditionalStyles",[]) or []
        for cond in conds:
            expr = cond.get("condition",""); sty = cond.get("style",{})
            if not expr or not sty: continue
            try:
                if self._ev.eval_expr(expr, res):
                    pat = copy.copy(el)
                    for a,v in sty.items():
                        try: setattr(pat,a,v)
                        except AttributeError: pass
                    return pat
            except Exception: pass
        return el

    def _sty(self, el, h, av="center") -> str:
        bg  = el.bgColor if el.bgColor not in ("transparent","") else "transparent"
        brd = f"border:{el.borderWidth}px {el.borderStyle} {el.borderColor};" if el.borderWidth > 0 and el.borderColor not in ("transparent","") else ""
        return (f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{h}px;"
                f"font-family:{el.fontFamily},Arial,sans-serif;font-size:{el.fontSize}pt;"
                f"font-weight:{'bold' if el.bold else 'normal'};"
                f"font-style:{'italic' if el.italic else 'normal'};"
                f"text-decoration:{'underline' if el.underline else 'none'};"
                f"text-align:{el.align};color:{el.color};background:{bg};"
                f"{brd}overflow:hidden;box-sizing:border-box;display:flex;align-items:{av};z-index:{el.zIndex}")

    def _calc_h(self, el, value) -> int:
        if not value: return el.h
        cw = max(1, int(el.w / max(0.01, el.fontSize * _PT_PX * _CHAR_PX)))
        lh = int(el.fontSize * _PT_PX * 1.4)
        txt = re.sub(r'<[^>]+>','', value)
        return max(el.h, max(1, math.ceil(len(txt)/cw)) * lh + 4)

    def _row_h(self, sec, item) -> int:
        base = sec.height; res = self._resolver.with_item(item); extra = 0
        for el in self._layout.elements_for(sec.id):
            if not getattr(el,"canGrow",False): continue
            extra = max(extra, self._calc_h(el, str(self._val(el,res,self._agg))) - el.h)
        return base + extra

    def _val(self, el, res, agg) -> str:
        if el.type == "field" and el.fieldPath: return self._fval(el, res, agg)
        if el.type == "text": return el.content or ""
        return ""

    def _secs(self, stype) -> list:
        return [s for s in self._layout.sections if s.stype == stype]

    def _secs_group(self, stype, gi) -> list:
        return [s for s in self._layout.sections
                if s.stype == stype and getattr(s,"groupIndex",0) == gi]


# ── Barcode SVG renderer (no external library needed) ────────────────────

def _render_barcode_svg(value: str, bc_type: str, w: int, h: int, show_text: bool) -> str:
    """Render a simplified barcode as inline SVG."""
    if bc_type in ("qr", "qrcode"):
        return _svg_qr_placeholder(value, w, h, show_text)
    # For linear codes render Code 128-style bars
    return _svg_linear_barcode(value, w, h, show_text)


def _svg_linear_barcode(value: str, w: int, h: int, show_text: bool) -> str:
    """Render a simplified linear barcode as SVG."""
    # Generate pattern from character codes (simplified)
    chars = value[:20]  # limit length
    pattern = []
    for ch in chars:
        code = ord(ch) % 16
        # Alternate narrow/wide bars based on bit pattern
        bits = f"{code:04b}"
        pattern.extend([1 if b == '1' else 0 for b in bits])
        pattern.append(0)  # gap

    # Always add quiet zones and start/stop
    pattern = [0,0] + pattern + [1,1,0,0]
    n = len(pattern)
    bar_w = max(1.0, (w - 4) / max(1, n))
    text_h = 10 if show_text else 0
    bar_h  = h - text_h - 4

    bars = []
    x = 2.0
    for bit in pattern:
        if bit:
            bars.append(f'<rect x="{x:.1f}" y="2" width="{bar_w:.1f}" height="{bar_h}" fill="#000"/>')
        x += bar_w

    text_el = ""
    if show_text:
        ty = h - 2
        text_el = f'<text x="{w/2}" y="{ty}" text-anchor="middle" font-family="monospace" font-size="8">{_esc(value)}</text>'

    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="white"/>'
            + "".join(bars) + text_el +
            f'</svg>')


def _svg_qr_placeholder(value: str, w: int, h: int, show_text: bool) -> str:
    """Render a QR placeholder as SVG."""
    size = min(w, h) - (12 if show_text else 4)
    x0 = (w - size) // 2
    text_el = ""
    if show_text:
        text_el = f'<text x="{w/2}" y="{h-2}" text-anchor="middle" font-family="monospace" font-size="7">{_esc(value[:20])}</text>'
    # Draw a finder pattern approximation
    cell = size // 7
    rects = []
    # Outer square
    rects.append(f'<rect x="{x0}" y="2" width="{size}" height="{size}" fill="none" stroke="#000" stroke-width="1"/>')
    # Finder patterns (top-left, top-right, bottom-left)
    for fx, fy in [(0,0),(4*cell,0),(0,4*cell)]:
        rects.append(f'<rect x="{x0+fx}" y="{2+fy}" width="{3*cell}" height="{3*cell}" fill="#000"/>')
        rects.append(f'<rect x="{x0+fx+cell//2}" y="{2+fy+cell//2}" width="{2*cell}" height="{2*cell}" fill="white"/>')
    # Data dots (simplified grid)
    for row in range(7):
        for col in range(7):
            if (row+col) % 3 == 0 and not (row < 3 and col < 3):
                rects.append(f'<rect x="{x0+col*cell}" y="{2+row*cell}" width="{cell-1}" height="{cell-1}" fill="#000"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="white"/>'
            + "".join(rects) + text_el +
            f'</svg>')


# ── Crosstab pivot renderer ──────────────────────────────────────────────

def _render_crosstab(items: list, row_field: str, col_field: str, val_field: str, summary: str) -> str:
    """Build an HTML crosstab table from flat items list."""
    if not items or not row_field or not col_field:
        return '<table><tr><td style="color:#888;font-size:7pt">No data</td></tr></table>'

    # Collect unique rows/cols
    row_vals = sorted(set(_dig_val(it, row_field) for it in items))
    col_vals = sorted(set(_dig_val(it, col_field) for it in items))

    # Aggregate
    def _key(it): return (_dig_val(it, row_field), _dig_val(it, col_field))
    buckets: dict = {}
    counts:  dict = {}
    for it in items:
        k = _key(it)
        v = _to_float(_dig_val(it, val_field) if val_field else 1)
        if k not in buckets:
            buckets[k] = 0.0; counts[k] = 0
        buckets[k] += v; counts[k] += 1

    def _cell(r, c):
        k = (r, c)
        if k not in buckets: return ""
        val = buckets[k] if summary == "sum" \
              else (counts[k] if summary == "count"
              else buckets[k]/counts[k] if counts[k] else 0)
        return f"{val:,.2f}" if isinstance(val, float) and val != int(val) else str(int(val)) if isinstance(val, float) else str(val)

    # Build HTML
    th = lambda t: f'<th style="background:#d0d8e8;font-weight:bold;border:1px solid #bbb;padding:1px 4px">{_esc(str(t))}</th>'
    td = lambda t: f'<td style="border:1px solid #bbb;padding:1px 4px;text-align:right">{_esc(str(t))}</td>'
    rows_html = ['<table style="border-collapse:collapse;font-size:7pt">']
    # Header
    rows_html.append('<tr>' + th("") + "".join(th(c) for c in col_vals) + th("Total") + '</tr>')
    # Data rows
    for r in row_vals:
        row_total = sum(buckets.get((r,c), 0) for c in col_vals)
        cells = "".join(td(_cell(r,c)) for c in col_vals)
        t_str = f"{row_total:,.2f}" if row_total != int(row_total) else str(int(row_total))
        rows_html.append(f'<tr>{th(r)}{cells}{td(t_str)}</tr>')
    # Grand total
    col_totals = [sum(buckets.get((r,c),0) for r in row_vals) for c in col_vals]
    gt = sum(col_totals)
    gt_str = f"{gt:,.2f}" if gt != int(gt) else str(int(gt))
    rows_html.append('<tr>' + th("Total") +
                     "".join(td(f"{t:,.2f}" if t != int(t) else str(int(t))) for t in col_totals) +
                     f'<td style="border:1px solid #bbb;padding:1px 4px;text-align:right;background:#e8f0e8;font-weight:bold">{gt_str}</td>' +
                     '</tr>')
    rows_html.append('</table>')
    return "".join(rows_html)


def _dig_val(obj, path: str):
    parts = path.split(".")
    v = obj
    for p in parts:
        if isinstance(v, dict): v = v.get(p, "")
        else: return ""
    return v


def _to_float(v) -> float:
    try: return float(v)
    except: return 0.0


# ── Convenience ──────────────────────────────────────────────────────────
def render_advanced(layout_raw, data, output_path=None, debug=False) -> str:
    import json
    if isinstance(layout_raw, (str, Path)):
        layout_raw = json.loads(Path(layout_raw).read_text(encoding="utf-8"))
    html = AdvancedHtmlEngine(layout_raw, data, debug=debug).render()
    if output_path: Path(output_path).write_text(html, encoding="utf-8")
    return html

def render_from_layout_file(data, layout_path, output_dir="output", filename=None) -> Path:
    import json
    from .pdf_generator import PdfGenerator
    lp = Path(layout_path); raw = json.loads(lp.read_text(encoding="utf-8"))
    html = render_advanced(raw, data)
    od = Path(output_dir); od.mkdir(parents=True, exist_ok=True)
    out = od / (filename or (lp.stem + ".pdf"))
    PdfGenerator().from_html_to_file(html, out); return out

def _esc(s) -> str:
    return _html.escape(str(s))

def _sk(val):
    try: return (0, float(val))
    except: return (1, str(val).lower())
