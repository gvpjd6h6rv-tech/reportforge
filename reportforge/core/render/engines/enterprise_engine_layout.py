from __future__ import annotations

from itertools import groupby

from .element_renderers import render_element
from .enterprise_engine_shared import _ROW_EVEN, _ROW_ODD, _esc, _sk


def build_css(engine) -> str:
    m = engine._layout.margin_mm
    pw = engine._layout.page_width
    dbg = ".cr-section,.cr-detail-row{outline:1px dashed rgba(255,0,0,.15)}" if engine._debug else ""
    style_vars = engine._style_reg.css_variables()
    page_shadow = ".rpt-page{box-shadow:0 2px 8px rgba(0,0,0,.15);margin:10px auto;}" if engine._preview else ""
    page_rule = "" if engine._preview else (
        f"@page{{size: {engine._norm.get('pageSize','A4')} "
        f"{engine._norm.get('orientation','portrait')};"
        f"margin:{m['top']}mm {m['right']}mm {m['bottom']}mm {m['left']}mm;"
        f"@bottom-center{{content:'Página 'counter(page)' de 'counter(pages);"
        f"font-family:Arial,sans-serif;font-size:7pt;color:#888}}}}"
    )
    return (
        f"{style_vars}\n"
        f"{page_rule}"
        f"*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}"
        f"body{{font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#000;background:#fff}}"
        f".rpt-page{{width:{pw}px;position:relative;page-break-after:always}}"
        f".rpt-page:last-child{{page-break-after:auto}}"
        f".cr-section{{position:relative;width:{pw}px;overflow:hidden;page-break-inside:avoid}}"
        f".cr-section.keep-together{{page-break-inside:avoid}}"
        f".cr-section.break-before{{page-break-before:always}}"
        f".cr-section.break-after{{page-break-after:always}}"
        f".cr-detail-row{{position:relative;width:{pw}px;overflow:hidden;page-break-inside:avoid}}"
        f".cr-el{{position:absolute;overflow:hidden;display:flex;padding:0 2px}}"
        f".cr-el-inner{{overflow:hidden;flex:1;min-width:0}}"
        f".wrap .cr-el-inner{{white-space:pre-wrap;word-break:break-word}}"
        f".nowrap .cr-el-inner{{white-space:nowrap;text-overflow:ellipsis}}"
        f"{dbg}"
        f"{page_shadow}"
    )


def build_pages(engine) -> str:
    ph_h = sum(s.height for s in engine._secs("ph"))
    pf_h = sum(s.height for s in engine._secs("pf"))
    rh_h = sum(s.height for s in engine._secs("rh"))
    usable = engine._page_h - engine._mtop - engine._mbot - ph_h - pf_h
    body = build_body_rows(engine)
    pages = []
    cur = []
    cy = float(rh_h)
    for row in body:
        if row.get("break_before") and cur:
            pages.append(cur)
            cur = []
            cy = 0.0
        avail = usable - (rh_h if not pages else 0)
        if cy + row["h"] > avail and cur:
            pages.append(cur)
            cur = []
            cy = 0.0
        cur.append(row)
        cy += row["h"]
        if row.get("break_after") and cur:
            pages.append(cur)
            cur = []
            cy = 0.0
    pages.append(cur)
    n = len(pages)
    return "\n".join(build_page(engine, rows, i == 0, i == n - 1) for i, rows in enumerate(pages))


def build_body_rows(engine) -> list[dict]:
    rows = []
    det = engine._secs("det")
    if not engine._groups:
        for i, item in enumerate(engine._items):
            engine._rt.push(item)
            for s in det:
                if not build_visible(engine, s, engine._resolver.with_item(item)):
                    continue
                rows.append({
                    "s": s, "item": item, "i": i, "alt": i % 2 == 1,
                    "h": build_row_h(engine, s, item), "gitems": [], "gval": None, "gtype": "det",
                    "break_before": getattr(s, "pageBreakBefore", False),
                    "break_after": getattr(s, "pageBreakAfter", False),
                })
    else:
        gf = engine._groups[0]["field"]
        sitems = sorted(engine._items, key=lambda it: _sk(it.get(gf, "")))
        gi = 0
        for gval, git in groupby(sitems, key=lambda it: it.get(gf, "")):
            gitems = list(git)
            engine._rt.reset_group()
            for s in engine._secs_group("gh", 0):
                if not build_visible(engine, s, engine._resolver):
                    continue
                rows.append({
                    "s": s, "item": gitems[0], "i": gi, "alt": False,
                    "h": s.height, "gitems": gitems, "gval": gval, "gtype": "gh",
                    "break_before": getattr(s, "pageBreakBefore", False),
                    "break_after": getattr(s, "pageBreakAfter", False),
                })
            for di, item in enumerate(gitems):
                engine._rt.push(item)
                for s in det:
                    if not build_visible(engine, s, engine._resolver.with_item(item)):
                        continue
                    rows.append({
                        "s": s, "item": item, "i": di, "alt": di % 2 == 1,
                        "h": build_row_h(engine, s, item),
                        "gitems": gitems, "gval": gval, "gtype": "det",
                        "break_before": False, "break_after": False,
                    })
            for s in engine._secs_group("gf", 0):
                if not build_visible(engine, s, engine._resolver):
                    continue
                rows.append({
                    "s": s, "item": gitems[-1], "i": gi, "alt": False,
                    "h": s.height, "gitems": gitems, "gval": gval, "gtype": "gf",
                    "break_before": False, "break_after": getattr(s, "pageBreakAfter", False),
                })
            gi += 1
    return rows


def build_page(engine, rows, first: bool, last: bool) -> str:
    pw = engine._layout.page_width
    out = [f'<div class="rpt-page" style="width:{pw}px">']
    if first:
        for s in engine._secs("rh"):
            if build_visible(engine, s, engine._resolver):
                out.append(build_static(engine, s))
    for s in engine._secs("ph"):
        if build_visible(engine, s, engine._resolver):
            out.append(build_static(engine, s))
    for row in rows:
        out.append(build_row(engine, row))
    if last:
        for s in engine._secs("rf"):
            if build_visible(engine, s, engine._resolver):
                out.append(build_static(engine, s))
    for s in engine._secs("pf"):
        if build_visible(engine, s, engine._resolver):
            out.append(build_static(engine, s))
    out.append("</div>")
    return "\n".join(out)


def build_row(engine, row: dict) -> str:
    s = row["s"]
    item = row["item"]
    if row["gtype"] in ("gh", "gf"):
        from ..expressions.aggregator import Aggregator
        agg = Aggregator(row["gitems"])
        res = engine._resolver.with_item(item) if item else engine._resolver
        return build_section(engine, s, res, agg)
    res = engine._resolver.with_item(item)
    bg = _ROW_EVEN if row["alt"] else _ROW_ODD
    sbg = getattr(s, "bgColor", "transparent")
    bgs = f"background:{sbg}" if sbg != "transparent" else f"background:{bg}"
    inner = "".join(render_element(engine, e, res, engine._agg) for e in engine._layout.elements_for(s.id))
    return f'<div class="cr-detail-row" data-stype="det" data-row="{row["i"]}" style="height:{row["h"]}px;{bgs}">{inner}</div>'


def build_static(engine, s) -> str:
    return build_section(engine, s, engine._resolver, engine._agg)


def build_section(engine, s, res, agg) -> str:
    inner = "".join(render_element(engine, e, res, agg) for e in engine._layout.elements_for(s.id))
    sbg = getattr(s, "bgColor", "transparent")
    bgs = f"background:{sbg};" if sbg != "transparent" else ""
    kt = " keep-together" if getattr(s, "keepTogether", False) else ""
    bb = " break-before" if getattr(s, "pageBreakBefore", False) else ""
    ba = " break-after" if getattr(s, "pageBreakAfter", False) else ""
    cls = f"cr-section{kt}{bb}{ba}"
    return f'<div class="{cls}" data-section="{s.id}" data-stype="{s.stype}" style="height:{s.height}px;{bgs}">{inner}</div>'


def build_visible(engine, section, res) -> bool:
    expr = getattr(section, "visibleIf", "") or ""
    if not expr:
        return True
    try:
        return bool(engine._ev.eval_expr(expr, res))
    except Exception:
        return True


def build_row_h(engine, sec, item) -> int:
    base = sec.height
    res = engine._resolver.with_item(item)
    extra = 0
    for el in engine._layout.elements_for(sec.id):
        if not getattr(el, "canGrow", False):
            continue
        from .element_renderers import element_value, _calc_h
        extra = max(extra, _calc_h(engine, el, str(element_value(engine, el, res, engine._agg))) - el.h)
    return base + extra


def build_secs(engine, stype: str) -> list:
    return [s for s in engine._layout.sections if s.stype == stype]


def build_secs_group(engine, stype: str, gi: int) -> list:
    return [s for s in engine._layout.sections if s.stype == stype and getattr(s, "groupIndex", 0) == gi]

