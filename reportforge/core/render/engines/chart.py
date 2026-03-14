# core/render/engines/chart.py
# Chart rendering engine — bar, line, pie via matplotlib.
# Produces base64 PNG data URIs for embedding in HTML.
from __future__ import annotations
import base64, io
from typing import Any, Optional

try:
    import matplotlib
    matplotlib.use("Agg")   # headless backend
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    HAS_MPL = True
except ImportError:
    HAS_MPL = False


# ── Palette ───────────────────────────────────────────────────────
_PALETTE = [
    "#1A73E8", "#E94560", "#00BCD4", "#FF9800",
    "#4CAF50", "#9C27B0", "#F44336", "#607D8B",
    "#795548", "#009688",
]


def render_chart(spec: dict, items: list[dict], resolver=None) -> str:
    """
    Render a chart element to an HTML <img> tag (base64 PNG).
    
    spec keys:
      chartType:  "bar" | "line" | "pie" | "area" | "scatter"
      labelField: field for x-axis / pie labels
      valueField: field for y values (or list for multiple series)
      title:      chart title
      width, height: in pixels
      colors:     list of hex colors (optional)
      showLegend: bool
      showGrid:   bool
      aggregateBy: field to group/aggregate before charting
    """
    if not HAS_MPL:
        return _placeholder(spec, "matplotlib not installed")

    ctype  = spec.get("chartType", "bar").lower()
    label  = spec.get("labelField", "")
    vfield = spec.get("valueField", "")
    title  = spec.get("title", "")
    w_px   = int(spec.get("width",  300))
    h_px   = int(spec.get("height", 200))
    colors = spec.get("colors", _PALETTE)
    show_legend = spec.get("showLegend", True)
    show_grid   = spec.get("showGrid", True)

    # Collect data
    labels, values = _collect(items, label, vfield, resolver)
    if not labels:
        return _placeholder(spec, "No data")

    try:
        fig, ax = plt.subplots(figsize=(w_px/96, h_px/96), dpi=96)
        fig.patch.set_facecolor("white")

        if ctype == "bar":
            bars = ax.bar(labels, values, color=[colors[i % len(colors)] for i in range(len(values))],
                          edgecolor="white", linewidth=0.5)
            if show_grid:
                ax.yaxis.grid(True, linestyle="--", alpha=0.5)
                ax.set_axisbelow(True)
            # Value labels on bars
            for bar in bars:
                h = bar.get_height()
                ax.text(bar.get_x() + bar.get_width()/2, h + h*0.01,
                        _fmt_val(h), ha="center", va="bottom", fontsize=7)

        elif ctype == "line":
            ax.plot(labels, values, marker="o", color=colors[0], linewidth=2, markersize=4)
            ax.fill_between(range(len(labels)), values, alpha=0.1, color=colors[0])
            if show_grid:
                ax.yaxis.grid(True, linestyle="--", alpha=0.5)

        elif ctype == "area":
            ax.fill_between(range(len(labels)), values, alpha=0.4, color=colors[0])
            ax.plot(range(len(labels)), values, color=colors[0], linewidth=2)
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=7)
            if show_grid:
                ax.yaxis.grid(True, linestyle="--", alpha=0.5)

        elif ctype == "pie":
            wedge_colors = [colors[i % len(colors)] for i in range(len(values))]
            wedges, texts, autotexts = ax.pie(
                values, labels=labels if not show_legend else None,
                colors=wedge_colors, autopct="%1.1f%%",
                startangle=90, wedgeprops={"edgecolor":"white","linewidth":1.5}
            )
            for t in autotexts:
                t.set_fontsize(7)
            if show_legend:
                ax.legend(labels, loc="lower center", bbox_to_anchor=(0.5, -0.05),
                          ncol=min(4, len(labels)), fontsize=7)

        elif ctype == "scatter":
            ax.scatter(range(len(labels)), values, c=colors[0], s=40, alpha=0.7)
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=7)
            if show_grid:
                ax.grid(True, linestyle="--", alpha=0.5)

        # Styling
        if title:
            ax.set_title(title, fontsize=9, fontweight="bold", pad=6)
        if ctype not in ("pie",):
            if len(labels) > 6:
                ax.tick_params(axis="x", labelrotation=30, labelsize=7)
            else:
                ax.tick_params(axis="x", labelsize=7)
            ax.tick_params(axis="y", labelsize=7)
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)

        fig.tight_layout(pad=0.5)
        data_uri = _fig_to_uri(fig)
        plt.close(fig)

        st = (f"position:absolute;left:{spec.get('x',0)}px;top:{spec.get('y',0)}px;"
              f"width:{w_px}px;height:{h_px}px;")
        return f'<div style="{st}"><img src="{data_uri}" style="width:100%;height:100%;" alt="{title}"></div>'

    except Exception as e:
        plt.close("all")
        return _placeholder(spec, f"Chart error: {e}")


def _collect(items, label_field, value_field, resolver) -> tuple[list, list]:
    labels, values = [], []
    for it in items:
        lv = it.get(label_field, "") if label_field else ""
        vv = it.get(value_field, 0)  if value_field else 0
        try:
            vv = float(vv)
        except (TypeError, ValueError):
            vv = 0.0
        labels.append(str(lv))
        values.append(vv)
    return labels, values


def _fig_to_uri(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=96)
    buf.seek(0)
    return "data:image/png;base64," + base64.b64encode(buf.read()).decode()


def _fmt_val(v: float) -> str:
    if v >= 1_000_000:
        return f"{v/1_000_000:.1f}M"
    if v >= 1_000:
        return f"{v/1_000:.1f}K"
    return f"{v:.1f}" if v != int(v) else str(int(v))


def _placeholder(spec: dict, msg: str) -> str:
    x, y = spec.get("x", 0), spec.get("y", 0)
    w, h = spec.get("width", 300), spec.get("height", 200)
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;'
            f'background:#F5F5F5;border:1px dashed #CCC;display:flex;align-items:center;'
            f'justify-content:center;font-size:8pt;color:#888;">{msg}</div>')
