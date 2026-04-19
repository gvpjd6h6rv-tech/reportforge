# core/render/engines/advanced_engine.py
# ReportForge Advanced HTML Engine — Phase 2 upgrade
# Pipeline: layout_dict + data → HTML (absolute positioned) → WeasyPrint → PDF
from __future__ import annotations

import datetime
import json
from itertools import groupby
from pathlib import Path
from typing import Any

from ..expressions.aggregator import Aggregator
from ..expressions.evaluator import ExpressionEvaluator
from ..pipeline.normalizer import normalize_layout
from ..resolvers.field_resolver import FieldResolver
from ..resolvers.layout_loader import Element, Layout, Section, layout_from_dict
from .advanced_engine_shared import _CHAR_PX, _PT_PX, _ROW_EVEN, _ROW_ODD, _SPECIAL, _esc, _sk
from .barcode_renderer import _render_barcode_svg, _svg_linear_barcode, _svg_qr_placeholder
from .crosstab_renderer import _render_crosstab
from .element_renderers import calc_row_height, render_element

try:
    from ..resolvers.field_resolver import format_value as _fmt
except ImportError:
    from ..resolvers.field_resolver import _format_value as _fmt


class AdvancedHtmlEngine:
    def __init__(self, layout_raw, data, debug=False, alt_colors=True):
        self._data = data
        self._debug = debug
        norm = normalize_layout(layout_raw)
        self._layout = layout_from_dict(norm)
        self._norm = norm
        self._items = list(data.get("items", []))
        for sr in reversed(norm.get("sortBy", [])):
            field = sr["field"]
            self._items.sort(key=lambda it: _sk(it.get(field, "")), reverse=sr.get("desc", False))
        self._resolver = FieldResolver(data)
        self._ev = ExpressionEvaluator(self._items)
        self._agg = Aggregator(self._items)
        self._groups = norm.get("groups", [])
        margins = self._layout.margin_mm
        self._page_h = norm.get("pageHeight", 1123)
        self._mtop = int(margins["top"] * 3.7795)
        self._mbot = int(margins["bottom"] * 3.7795)
        self._print_date = datetime.date.today().strftime("%d/%m/%Y")
        self._print_time = datetime.datetime.now().strftime("%H:%M:%S")

    def render(self) -> str:
        css = self._css()
        title = _esc(self._layout.name)
        body = self._pages()
        return (
            f"<!DOCTYPE html>\n<html lang='es'>\n<head>"
            f"<meta charset='UTF-8'><title>{title}</title>"
            f"<style>{css}</style></head>"
            f"\n<body>\n{body}\n</body></html>"
        )

    def render_preview(self) -> str:
        self._preview = True
        css = self._css()
        body = self._pages()
        return (
            f"<!DOCTYPE html>\n<html lang='es'>\n<head>"
            f"<meta charset='UTF-8'><title>Preview</title>"
            f"<style>{css}</style></head>"
            f"\n<body>\n{body}\n</body></html>"
        )

    def _css(self) -> str:
        margins = self._layout.margin_mm
        page_width = self._layout.page_width
        dbg = ".cr-section,.cr-detail-row{outline:1px dashed rgba(255,0,0,.15)}" if self._debug else ""
        page_shadow = ".rpt-page{box-shadow:0 2px 8px rgba(0,0,0,.15);margin:10px auto;}" if getattr(self, "_preview", False) else ""
        page_rule = "" if getattr(self, "_preview", False) else (
            f"@page{{size: {self._norm.get('pageSize','A4')} {self._norm.get('orientation','portrait')};"
            f"margin:{margins['top']}mm {margins['right']}mm {margins['bottom']}mm {margins['left']}mm;"
            f"@bottom-center{{content:'Página 'counter(page)' de 'counter(pages);"
            f"font-family:Arial,sans-serif;font-size:7pt;color:#888}}}}"
        )
        return (
            f"{page_rule}"
            f"*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}"
            f"body{{font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#000;background:#fff}}"
            f".rpt-page{{width:{page_width}px;position:relative;page-break-after:always}}"
            f".rpt-page:last-child{{page-break-after:auto}}"
            f".cr-section{{position:relative;width:{page_width}px;overflow:hidden;page-break-inside:avoid}}"
            f".cr-section.keep-together{{page-break-inside:avoid}}"
            f".cr-section.break-before{{page-break-before:always}}"
            f".cr-section.break-after{{page-break-after:always}}"
            f".cr-detail-row{{position:relative;width:{page_width}px;overflow:hidden;page-break-inside:avoid}}"
            f".cr-el{{position:absolute;overflow:hidden;display:flex;padding:0 2px}}"
            f".cr-el-inner{{overflow:hidden;flex:1;min-width:0}}"
            f".wrap .cr-el-inner{{white-space:pre-wrap;word-break:break-word}}"
            f".nowrap .cr-el-inner{{white-space:nowrap;text-overflow:ellipsis}}"
            f"{dbg}"
            f"{page_shadow}"
        )

    def _pages(self) -> str:
        ph_h = sum(s.height for s in self._secs("ph"))
        pf_h = sum(s.height for s in self._secs("pf"))
        rh_h = sum(s.height for s in self._secs("rh"))
        usable = self._page_h - self._mtop - self._mbot - ph_h - pf_h
        body = self._body_rows()
        pages: list[list] = []
        cur: list = []
        cy = float(rh_h)
        for row in body:
            sec = row["s"]
            force_break = getattr(sec, "newPageBefore", False)
            avail = usable - (rh_h if not pages else 0)
            row_h = row["h"]
            if (force_break and cur) or (cy + row_h > avail and cur):
                pages.append(cur)
                cur = []
                cy = 0.0
            cur.append(row)
            cy += row_h
        pages.append(cur)
        total_pages = len(pages)
        return "\n".join(self._page(rows, i == 0, i == len(pages) - 1, i + 1, total_pages) for i, rows in enumerate(pages))

    def _body_rows(self) -> list[dict]:
        rows = []
        det = self._secs("det")
        if not self._groups:
            for i, item in enumerate(self._items):
                prev_item = self._items[i - 1] if i > 0 else None
                next_item = self._items[i + 1] if i < len(self._items) - 1 else None
                for s in det:
                    if self._suppress_section(s, self._resolver.with_item(item)):
                        continue
                    rows.append(
                        {
                            "s": s,
                            "item": item,
                            "i": i,
                            "alt": i % 2 == 1,
                            "h": calc_row_height(self, s, item),
                            "gitems": [],
                            "gval": None,
                            "gtype": "det",
                            "record_number": i + 1,
                            "prev": prev_item,
                            "next": next_item,
                        }
                    )
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
                    rows.append(
                        {
                            "s": s,
                            "item": item,
                            "i": di,
                            "alt": di % 2 == 1,
                            "h": calc_row_height(self, s, item),
                            "gitems": parent_gitems or items,
                            "gval": None,
                            "gtype": "det",
                            "record_number": di + 1,
                        }
                    )
            return rows
        gf = groups[0]["field"]
        go = groups[0].get("order", "ASC").upper()
        sorted_items = sorted(items, key=lambda it: _sk(it.get(gf, "")), reverse=(go == "DESC"))
        gi = 0
        for gval, git in groupby(sorted_items, key=lambda it: it.get(gf, "")):
            gitems = list(git)
            for s in self._secs_group("gh", level):
                if not self._suppress_section(s, self._resolver.with_item(gitems[0])):
                    rows.append(
                        {
                            "s": s,
                            "item": gitems[0],
                            "i": gi,
                            "alt": False,
                            "h": s.height,
                            "gitems": gitems,
                            "gval": gval,
                            "gtype": "gh",
                            "group_number": gi + 1,
                        }
                    )
            sub_rows = self._body_rows_grouped(gitems, groups[1:], level + 1, det_secs, gitems)
            rows.extend(sub_rows)
            for s in self._secs_group("gf", level):
                if not self._suppress_section(s, self._resolver.with_item(gitems[-1])):
                    rows.append(
                        {
                            "s": s,
                            "item": gitems[-1],
                            "i": gi,
                            "alt": False,
                            "h": s.height,
                            "gitems": gitems,
                            "gval": gval,
                            "gtype": "gf",
                            "group_number": gi + 1,
                        }
                    )
            gi += 1
        return rows

    def _suppress_section(self, sec, res) -> bool:
        sf = getattr(sec, "suppressFormula", None) or getattr(sec, "suppress", None)
        if not sf or not isinstance(sf, str):
            return bool(sf) if sf else False
        sf = sf.strip()
        if sf.lower() in ("true", "1", "yes"):
            return True
        if sf.lower() in ("false", "0", "no", ""):
            return False
        try:
            return bool(self._ev.eval_expr(sf, res))
        except Exception:
            return False

    def _page(self, rows, first, last, page_num, total_pages) -> str:
        page_width = self._layout.page_width
        ctx = {
            "page_number": page_num,
            "total_pages": total_pages,
            "print_date": self._print_date,
            "print_time": self._print_time,
        }
        parts = [f'<div class="rpt-page" style="width:{page_width}px">']
        if first:
            for s in self._secs("rh"):
                parts.append(self._static(s, ctx))
        for s in self._secs("ph"):
            parts.append(self._static(s, ctx))
        for row in rows:
            parts.append(self._row(row, ctx))
        if last:
            for s in self._secs("rf"):
                parts.append(self._static(s, ctx))
        for s in self._secs("pf"):
            parts.append(self._static(s, ctx))
        parts.append("</div>")
        return "\n".join(parts)

    def _row(self, row, ctx=None) -> str:
        ctx = dict(ctx or {})
        s = row["s"]
        item = row["item"]
        ctx["record_number"] = row.get("record_number", 1)
        ctx["group_number"] = row.get("group_number", 1)
        if row["gtype"] in ("gh", "gf"):
            agg = Aggregator(row["gitems"])
            res = self._resolver.with_item(item) if item else self._resolver
            return self._sec(s, res, agg, ctx)
        res = self._resolver.with_item(item)
        bg = _ROW_EVEN if row["alt"] else _ROW_ODD
        sbg = getattr(s, "bgColor", "transparent")
        bgs = f"background:{sbg}" if sbg != "transparent" else f"background:{bg}"
        inner = "".join(render_element(self, e, res, self._agg, ctx) for e in self._layout.elements_for(s.id))
        return f'<div class="cr-detail-row" data-stype="det" data-row="{row["i"]}" style="height:{row["h"]}px;{bgs}">{inner}</div>'

    def _static(self, s, ctx=None) -> str:
        return self._sec(s, self._resolver, self._agg, ctx or {})

    def _sec(self, s, res, agg, ctx=None) -> str:
        ctx = ctx or {}
        inner = "".join(render_element(self, e, res, agg, ctx) for e in self._layout.elements_for(s.id))
        sbg = getattr(s, "bgColor", "transparent")
        bgs = f"background:{sbg};" if sbg != "transparent" else ""
        return (
            f'<div class="cr-section" data-section="{s.id}" data-stype="{s.stype}" '
            f'style="height:{s.height}px;{bgs}">{inner}</div>'
        )

    def _secs(self, stype) -> list:
        return [s for s in self._layout.sections if s.stype == stype]

    def _secs_group(self, stype, gi) -> list:
        return [s for s in self._layout.sections if s.stype == stype and getattr(s, "groupIndex", 0) == gi]


def render_advanced(layout_raw, data, output_path=None, debug=False) -> str:
    if isinstance(layout_raw, (str, Path)):
        layout_raw = json.loads(Path(layout_raw).read_text(encoding="utf-8"))
    html = AdvancedHtmlEngine(layout_raw, data, debug=debug).render()
    if output_path:
        Path(output_path).write_text(html, encoding="utf-8")
    return html


def render_from_layout_file(data, layout_path, output_dir="output", filename=None) -> Path:
    from .pdf_generator import PdfGenerator

    lp = Path(layout_path)
    raw = json.loads(lp.read_text(encoding="utf-8"))
    html = render_advanced(raw, data)
    od = Path(output_dir)
    od.mkdir(parents=True, exist_ok=True)
    out = od / (filename or (lp.stem + ".pdf"))
    PdfGenerator().from_html_to_file(html, out)
    return out
