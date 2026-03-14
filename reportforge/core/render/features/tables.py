# core/render/features/tables.py
# Table element: structured column layout with header, detail rows, footer.
# Rendered as absolutely-positioned HTML table within a section.
from __future__ import annotations
import html as _html
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from ..resolvers.field_resolver import FieldResolver
    from ..expressions.evaluator import ExpressionEvaluator


def render_table(el_raw: dict, data: dict,
                 resolver: "FieldResolver",
                 ev: "ExpressionEvaluator") -> str:
    """
    Render a table element to HTML.

    Element definition:
        {
            "type": "table",
            "x": 4, "y": 0, "w": 700, "h": 200,
            "dataPath": "items",
            "showHeader": true,
            "showFooter": true,
            "headerHeight": 16,
            "rowHeight": 14,
            "footerHeight": 16,
            "alternateRows": true,
            "borderWidth": 1,
            "borderColor": "#CCCCCC",
            "headerStyle": {"bgColor": "#1A3A6B", "color": "#FFFFFF", "bold": true},
            "footerStyle": {"bgColor": "#E8EEF8", "color": "#1A3A6B", "bold": true},
            "columns": [
                {
                    "header": "Code",
                    "field": "item.code",
                    "width": 80,
                    "align": "left",
                    "fmt": null,
                    "footerExpr": "",
                    "footerFmt": "currency"
                },
                {
                    "header": "Description",
                    "field": "item.name",
                    "width": 300,
                    "align": "left"
                },
                {
                    "header": "Total",
                    "field": "item.total",
                    "width": 100,
                    "align": "right",
                    "fmt": "currency",
                    "footerExpr": "sum(items.total)",
                    "footerFmt": "currency"
                }
            ]
        }
    """
    from ..resolvers.field_resolver import FieldResolver, format_value
    from ..expressions.aggregator import Aggregator

    x          = int(el_raw.get("x", 0))
    y          = int(el_raw.get("y", 0))
    w          = int(el_raw.get("w", 500))
    h          = int(el_raw.get("h", 200))
    data_path  = el_raw.get("dataPath", "items")
    show_hdr   = bool(el_raw.get("showHeader", True))
    show_ftr   = bool(el_raw.get("showFooter", False))
    hdr_h      = int(el_raw.get("headerHeight", 16))
    row_h      = int(el_raw.get("rowHeight", 14))
    ftr_h      = int(el_raw.get("footerHeight", 16))
    alt_rows   = bool(el_raw.get("alternateRows", True))
    bw         = int(el_raw.get("borderWidth", 1))
    bc         = el_raw.get("borderColor", "#CCCCCC")
    columns    = el_raw.get("columns", [])

    hdr_style  = el_raw.get("headerStyle", {"bgColor":"#1A3A6B","color":"#FFFFFF","bold":True})
    ftr_style  = el_raw.get("footerStyle", {"bgColor":"#E8EEF8","color":"#1A3A6B","bold":True})
    row_style  = el_raw.get("rowStyle", {"color":"#000000","fontSize":8})

    # Get items
    items = _dig(data, data_path)
    agg   = Aggregator(items)

    border = f"border:{bw}px solid {bc}" if bw > 0 else ""
    table_st = (
        f"position:absolute;left:{x}px;top:{y}px;width:{w}px;"
        f"overflow:hidden;font-family:Arial,sans-serif;font-size:8pt;"
        f"{border};border-collapse:collapse;box-sizing:border-box"
    )

    rows_html = []

    # Header row
    if show_hdr and columns:
        rows_html.append(_table_row(columns, None, hdr_style, hdr_h, True, bw, bc, agg, ev, resolver))

    # Detail rows
    for idx, item in enumerate(items):
        alt = alt_rows and idx % 2 == 1
        rs  = dict(row_style)
        if alt: rs["bgColor"] = "#F4F4F2"
        item_res = resolver.with_item(item)
        rows_html.append(_table_row(columns, item, rs, row_h, False, bw, bc, agg, ev, item_res))

    # Footer row
    if show_ftr and columns:
        rows_html.append(_table_row(columns, None, ftr_style, ftr_h, False, bw, bc, agg, ev, resolver, footer=True))

    inner = "".join(rows_html)
    return f'<div style="{table_st}"><table style="width:100%;border-collapse:collapse">{inner}</table></div>'


def _table_row(columns, item, style, height, is_header, bw, bc, agg, ev, resolver, footer=False):
    from ..resolvers.field_resolver import format_value

    bg    = style.get("bgColor", "transparent")
    color = style.get("color", "#000000")
    bold  = style.get("bold", False)
    fs    = style.get("fontSize", 8)
    fw    = "bold" if bold else "normal"
    tr_st = f"height:{height}px;background:{bg}"
    cells = []

    for col in columns:
        cw    = int(col.get("width", 100))
        align = col.get("align", "left")
        td_st = (
            f"width:{cw}px;max-width:{cw}px;overflow:hidden;"
            f"text-align:{align};color:{color};font-weight:{fw};"
            f"font-size:{fs}pt;padding:1px 3px;vertical-align:middle;"
            f"border:1px solid {bc};box-sizing:border-box;white-space:nowrap"
        )

        if is_header:
            cell_val = _esc(str(col.get("header", "")))
        elif footer:
            expr = col.get("footerExpr", "")
            fmt  = col.get("footerFmt")
            if expr:
                try:
                    val = ev.eval_expr(expr, resolver)
                    cell_val = _esc(format_value(val, fmt) if fmt else str(val))
                except Exception:
                    cell_val = ""
            else:
                cell_val = _esc(str(col.get("footerLabel", "")))
        else:
            field = col.get("field", "")
            fmt   = col.get("fmt")
            try:
                raw = resolver.get(field) if field else ""
                cell_val = _esc(format_value(raw, fmt) if fmt else str(raw if raw != "" else ""))
            except Exception:
                cell_val = ""

        tag = "th" if is_header else "td"
        cells.append(f'<{tag} style="{td_st}">{cell_val}</{tag}>')

    return f'<tr style="{tr_st}">{"".join(cells)}</tr>'


def _dig(obj, path: str):
    cur = obj
    for k in path.split("."):
        if isinstance(cur, dict): cur = cur.get(k, [])
        else: return []
    return cur if isinstance(cur, list) else []

def _esc(s: str) -> str:
    return _html.escape(str(s))
