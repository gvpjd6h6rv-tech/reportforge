from __future__ import annotations

import base64
import io

from .chart_support import _MPL_AVAILABLE, _PALETTE, esc, flt, get_items, plt


def render_chart_element(data: dict, el_raw: dict, dpi: int = 96) -> str:
    chart_type = el_raw.get("chartType", "bar").lower()
    data_path = el_raw.get("dataPath", "items")
    label_field = el_raw.get("labelField", "")
    value_field = el_raw.get("valueField", "")
    series = el_raw.get("seriesFields", [])
    title = el_raw.get("title", "")
    w_px = int(el_raw.get("w", 400))
    h_px = int(el_raw.get("h", 250))
    show_legend = bool(el_raw.get("showLegend", True))
    show_grid = bool(el_raw.get("showGrid", True))
    x = int(el_raw.get("x", 0))
    y = int(el_raw.get("y", 0))

    items = get_items(data, data_path)
    div_style = (
        f"position:absolute;left:{x}px;top:{y}px;"
        f"width:{w_px}px;height:{h_px}px;overflow:hidden"
    )

    if not _MPL_AVAILABLE or not items:
        return _placeholder(div_style, chart_type, title, w_px, h_px)

    try:
        src = _render_matplotlib(
            chart_type, items, label_field, value_field, series,
            title, w_px, h_px, show_legend, show_grid, dpi
        )
        return (
            f'<div style="{div_style}">'
            f'<img src="{src}" style="width:100%;height:100%;object-fit:contain" '
            f'alt="{esc(title)}"></div>'
        )
    except Exception as exc:
        return _placeholder(div_style, chart_type, f"{title} ({exc})", w_px, h_px)


def _render_matplotlib(chart_type, items, label_field, value_field, series,
                       title, w_px, h_px, legend, grid, dpi) -> str:
    w_in = w_px / dpi
    h_in = h_px / dpi
    fig, ax = plt.subplots(figsize=(w_in, h_in), dpi=dpi)
    fig.patch.set_facecolor("#FFFFFF")
    ax.set_facecolor("#FAFAFA")

    labels = [str(it.get(label_field, i)) for i, it in enumerate(items)]
    colors = _PALETTE[:len(items)]

    if chart_type in ("bar", "hbar"):
        _bar(ax, items, labels, value_field, series, colors, horizontal=(chart_type == "hbar"))
    elif chart_type in ("line", "area"):
        _line(ax, items, labels, value_field, series, colors, area=(chart_type == "area"))
    elif chart_type in ("pie", "donut"):
        _pie(ax, items, labels, value_field, colors, donut=(chart_type == "donut"))
    else:
        _bar(ax, items, labels, value_field, series, colors, False)

    if title:
        ax.set_title(title, fontsize=8, fontweight="bold", color="#1A3A6B", pad=4)
    if grid and chart_type not in ("pie", "donut"):
        ax.grid(True, linestyle="--", alpha=0.4, color="#CCCCCC")
        ax.set_axisbelow(True)
    if legend and (series or chart_type not in ("pie", "donut")):
        ax.legend(fontsize=6, loc="best", framealpha=0.7)

    ax.tick_params(labelsize=6)
    fig.tight_layout(pad=0.3)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight", facecolor="#FFFFFF")
    plt.close(fig)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def _bar(ax, items, labels, vf, series, colors, horizontal):
    if series:
        x = range(len(labels))
        w = 0.8 / len(series)
        for i, sf in enumerate(series):
            vals = [flt(it.get(sf, 0)) for it in items]
            offset = [xi + i * w - 0.4 for xi in x]
            if horizontal:
                ax.barh(offset, vals, w * 0.9, label=sf, color=_PALETTE[i % len(_PALETTE)])
            else:
                ax.bar(offset, vals, w * 0.9, label=sf, color=_PALETTE[i % len(_PALETTE)])
        if horizontal:
            ax.set_yticks(list(x))
            ax.set_yticklabels(labels, fontsize=6)
        else:
            ax.set_xticks(list(x))
            ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=6)
    else:
        vals = [flt(it.get(vf, 0)) for it in items]
        if horizontal:
            ax.barh(labels, vals, color=colors)
            ax.set_yticklabels(labels, fontsize=6)
        else:
            ax.bar(labels, vals, color=colors)
            ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=6)


def _line(ax, items, labels, vf, series, colors, area):
    x = range(len(labels))
    fs = series if series else [vf]
    for i, sf in enumerate(fs):
        vals = [flt(it.get(sf, 0)) for it in items]
        c = _PALETTE[i % len(_PALETTE)]
        ax.plot(list(x), vals, marker="o", markersize=3, linewidth=1.5, label=sf, color=c)
        if area:
            ax.fill_between(list(x), vals, alpha=0.15, color=c)
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=6)


def _pie(ax, items, labels, vf, colors, donut):
    vals = [max(0, flt(it.get(vf, 0))) for it in items]
    if not any(v > 0 for v in vals):
        vals = [1] * len(vals)
    wedge_props = {"width": 0.5} if donut else {}
    ax.pie(
        vals,
        labels=labels,
        colors=colors,
        autopct="%1.1f%%",
        pctdistance=0.75,
        textprops={"fontsize": 6},
        **wedge_props,
    )
    if donut:
        ax.add_patch(plt.Circle((0, 0), 0.35, color="white"))


def _placeholder(div_style, chart_type, title, w, h) -> str:
    icon = {"bar": "📊", "hbar": "📊", "line": "📈", "area": "📈", "pie": "🥧", "donut": "🍩"}.get(chart_type, "📊")
    svg = (
        f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg">'
        f'<rect width="100%" height="100%" fill="#F5F5F5" stroke="#DDD" stroke-width="1"/>'
        f'<text x="50%" y="45%" text-anchor="middle" font-size="24">{icon}</text>'
        f'<text x="50%" y="60%" text-anchor="middle" font-size="9" fill="#888">'
        f'{esc(title or chart_type.title())} Chart</text>'
        f'<text x="50%" y="72%" text-anchor="middle" font-size="7" fill="#AAA">'
        f'(matplotlib not installed)</text></svg>'
    )
    return f'<div style="{div_style}">{svg}</div>'
