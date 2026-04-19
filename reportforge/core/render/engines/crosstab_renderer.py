from __future__ import annotations

from .advanced_engine_shared import _dig_val, _esc, _to_float


def _render_crosstab(items: list, row_field: str, col_field: str, val_field: str, summary: str) -> str:
    if not items or not row_field or not col_field:
        return '<table><tr><td style="color:#888;font-size:7pt">No data</td></tr></table>'

    row_vals = sorted(set(_dig_val(it, row_field) for it in items))
    col_vals = sorted(set(_dig_val(it, col_field) for it in items))

    def _key(it):
        return (_dig_val(it, row_field), _dig_val(it, col_field))

    buckets: dict = {}
    counts: dict = {}
    for it in items:
        key = _key(it)
        value = _to_float(_dig_val(it, val_field) if val_field else 1)
        if key not in buckets:
            buckets[key] = 0.0
            counts[key] = 0
        buckets[key] += value
        counts[key] += 1

    def _cell(r, c):
        key = (r, c)
        if key not in buckets:
            return ""
        val = (
            buckets[key]
            if summary == "sum"
            else counts[key]
            if summary == "count"
            else buckets[key] / counts[key] if counts[key] else 0
        )
        return (
            f"{val:,.2f}"
            if isinstance(val, float) and val != int(val)
            else str(int(val))
            if isinstance(val, float)
            else str(val)
        )

    th = lambda t: f'<th style="background:#d0d8e8;font-weight:bold;border:1px solid #bbb;padding:1px 4px">{_esc(str(t))}</th>'
    td = lambda t: f'<td style="border:1px solid #bbb;padding:1px 4px;text-align:right">{_esc(str(t))}</td>'
    rows_html = ['<table style="border-collapse:collapse;font-size:7pt">']
    rows_html.append('<tr>' + th("") + "".join(th(c) for c in col_vals) + th("Total") + "</tr>")
    for r in row_vals:
        row_total = sum(buckets.get((r, c), 0) for c in col_vals)
        cells = "".join(td(_cell(r, c)) for c in col_vals)
        t_str = f"{row_total:,.2f}" if row_total != int(row_total) else str(int(row_total))
        rows_html.append(f"<tr>{th(r)}{cells}{td(t_str)}</tr>")
    col_totals = [sum(buckets.get((r, c), 0) for r in row_vals) for c in col_vals]
    gt = sum(col_totals)
    gt_str = f"{gt:,.2f}" if gt != int(gt) else str(int(gt))
    rows_html.append(
        "<tr>"
        + th("Total")
        + "".join(td(f"{t:,.2f}" if t != int(t) else str(int(t))) for t in col_totals)
        + f'<td style="border:1px solid #bbb;padding:1px 4px;text-align:right;background:#e8f0e8;font-weight:bold">{gt_str}</td>'
        + "</tr>"
    )
    rows_html.append("</table>")
    return "".join(rows_html)
