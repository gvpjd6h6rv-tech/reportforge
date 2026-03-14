# core/render/engines/table.py
# Table element renderer — structured grid with header, detail, footer.
# Produces absolute-positioned HTML table from layout spec.
from __future__ import annotations
import html as _html


def render_table(spec: dict, items: list, resolver, evaluator,
                 agg=None, group_items=None) -> str:
    """
    Render a table element.
    
    spec structure:
      type:    "table"
      x,y,w,h: position and total height hint
      columns: [{"field":"name","label":"Name","width":200,"fmt":"","align":"left"}]
      header:  True/False (show column headers)
      footer:  True/False (show totals footer)
      rowHeight: int (default 16)
      headerHeight: int (default 18)
      footerHeight: int (default 18)
      headerStyle: {fontSize, bold, bgColor, color}
      rowStyle:    {fontSize, bgColor, color}
      footerStyle: {fontSize, bold, bgColor, color}
      altRows: True/False
      borderWidth: 1
      borderColor: "#CCCCCC"
    """
    x          = spec.get("x", 0)
    y          = spec.get("y", 0)
    total_w    = spec.get("w", 500)
    columns    = spec.get("columns", [])
    show_hdr   = spec.get("header", True)
    show_ftr   = spec.get("footer", False)
    row_h      = int(spec.get("rowHeight",     16))
    hdr_h      = int(spec.get("headerHeight",  18))
    ftr_h      = int(spec.get("footerHeight",  18))
    alt_rows   = spec.get("altRows", True)
    bw         = spec.get("borderWidth",  1)
    bc         = spec.get("borderColor", "#CCCCCC")
    hdr_style  = spec.get("headerStyle", {"bold": True, "bgColor": "#E8EAED", "fontSize": 8})
    row_style  = spec.get("rowStyle",    {"fontSize": 8})
    ftr_style  = spec.get("footerStyle", {"bold": True, "bgColor": "#E8EAED", "fontSize": 8})
    border_css = f"border:{bw}px solid {bc};"

    parts = []

    # ── Outer container ───────────────────────────────────────────
    total_rows_h = len(items) * row_h + (hdr_h if show_hdr else 0) + (ftr_h if show_ftr else 0)
    container_h  = max(spec.get("h", total_rows_h), total_rows_h)
    outer_st = (f"position:absolute;left:{x}px;top:{y}px;"
                f"width:{total_w}px;height:{container_h}px;"
                f"overflow:hidden;{border_css}")
    parts.append(f'<div style="{outer_st}">')

    cur_y = 0

    # ── Header row ────────────────────────────────────────────────
    if show_hdr and columns:
        hst = _row_style(hdr_style, 0, total_w, hdr_h, border_css)
        parts.append(f'<div style="{hst}">')
        cur_x = 0
        for col in columns:
            cw = int(col.get("width", total_w // max(1, len(columns))))
            al = col.get("align", "left")
            label = _esc(str(col.get("label", col.get("field", ""))))
            fs = hdr_style.get("fontSize", 8)
            bold = "bold" if hdr_style.get("bold", True) else "normal"
            bg  = hdr_style.get("bgColor", "#E8EAED")
            fg  = hdr_style.get("color", "#333333")
            cst = (f"position:absolute;left:{cur_x}px;top:0;width:{cw}px;height:{hdr_h}px;"
                   f"font-size:{fs}pt;font-weight:{bold};color:{fg};background:{bg};"
                   f"text-align:{al};padding:0 4px;display:flex;align-items:center;"
                   f"box-sizing:border-box;border-right:{bw}px solid {bc};overflow:hidden;")
            parts.append(f'<div style="{cst}">{label}</div>')
            cur_x += cw
        parts.append('</div>')
        cur_y += hdr_h

    # ── Data rows ─────────────────────────────────────────────────
    for ri, item in enumerate(items):
        alt  = alt_rows and ri % 2 == 1
        bg   = row_style.get("bgColor", "#FFFFFF")
        if alt: bg = "#F4F4F2"
        rst  = _row_style({"bgColor": bg}, cur_y, total_w, row_h, border_css)
        parts.append(f'<div style="{rst}">')
        cur_x = 0
        for col in columns:
            cw    = int(col.get("width", total_w // max(1, len(columns))))
            field = col.get("field", "")
            fmt   = col.get("fmt", "")
            al    = col.get("align", "left")
            fs    = row_style.get("fontSize", 8)
            fg    = row_style.get("color", "#333333")
            # Resolve field value
            item_res = resolver.with_item(item)
            if evaluator and evaluator.contains_expr("{" + field + "}"):
                val = evaluator.eval_expr(field, item_res, group_items)
            else:
                val = item_res.get_formatted(field, fmt)
            cst = (f"position:absolute;left:{cur_x}px;top:0;width:{cw}px;height:{row_h}px;"
                   f"font-size:{fs}pt;color:{fg};background:{bg};"
                   f"text-align:{al};padding:0 4px;display:flex;align-items:center;"
                   f"box-sizing:border-box;border-right:{bw}px solid {bc};"
                   f"overflow:hidden;white-space:nowrap;text-overflow:ellipsis;")
            parts.append(f'<div style="{cst}">{_esc(str(val))}</div>')
            cur_x += cw
        parts.append('</div>')
        cur_y += row_h

    # ── Footer row (totals) ───────────────────────────────────────
    if show_ftr and columns:
        fst = _row_style(ftr_style, cur_y, total_w, ftr_h, border_css)
        parts.append(f'<div style="{fst}">')
        cur_x = 0
        from ..expressions.aggregator import Aggregator
        agg_obj = Aggregator(group_items or items)
        for col in columns:
            cw    = int(col.get("width", total_w // max(1, len(columns))))
            al    = col.get("align", "left")
            fs    = ftr_style.get("fontSize", 8)
            bold  = "bold" if ftr_style.get("bold", True) else "normal"
            bg    = ftr_style.get("bgColor", "#E8EAED")
            fg    = ftr_style.get("color", "#333333")
            # Show sum for numeric columns if footerFn specified
            fn    = col.get("footerFn", "")
            val   = ""
            if fn:
                field = col.get("field", "")
                try:
                    v = getattr(agg_obj, fn)(field)
                    fmt = col.get("fmt", "")
                    from ..resolvers.field_resolver import format_value
                    val = format_value(v, fmt) if fmt else str(round(v, 2) if isinstance(v, float) else v)
                except Exception:
                    pass
            cst = (f"position:absolute;left:{cur_x}px;top:0;width:{cw}px;height:{ftr_h}px;"
                   f"font-size:{fs}pt;font-weight:{bold};color:{fg};background:{bg};"
                   f"text-align:{al};padding:0 4px;display:flex;align-items:center;"
                   f"box-sizing:border-box;border-right:{bw}px solid {bc};overflow:hidden;")
            parts.append(f'<div style="{cst}">{_esc(str(val))}</div>')
            cur_x += cw
        parts.append('</div>')

    parts.append('</div>')
    return "".join(parts)


def _row_style(style: dict, top: int, width: int, height: int, border_css: str) -> str:
    bg = style.get("bgColor", "#FFFFFF")
    return (f"position:absolute;left:0;top:{top}px;width:{width}px;height:{height}px;"
            f"background:{bg};border-bottom:{border_css}")


def _esc(s: str) -> str:
    return _html.escape(s)
