from __future__ import annotations


def render_chart(engine, el, res, agg) -> str:
    style = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
    try:
        from .chart import render_chart as _render_chart

        spec = {
            "chartType": getattr(el, "chartType", "bar") or "bar",
            "labelField": getattr(el, "labelField", None),
            "valueField": getattr(el, "valueField", None),
            "title": getattr(el, "content", None) or "",
            "width": el.w,
            "height": el.h,
        }
        items = getattr(agg, "_items", None) or engine._items
        img_tag = _render_chart(spec, items, resolver=res)
        return f'<div class="cr-chart" style="{style}">{img_tag}</div>'
    except Exception:
        return (
            f'<div class="cr-chart" style="{style};border:1px dashed #aaa;background:#f9f9f9;display:flex;'
            f'align-items:center;justify-content:center"><span style="font-size:7pt;color:#888">📊 Chart</span></div>'
        )


def render_table_el(engine, el, res, agg) -> str:
    style = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex};overflow:auto"
    try:
        from .table import render_table as _render_table

        items = getattr(agg, "_items", None) or engine._items
        spec = el.__dict__ if hasattr(el, "__dict__") else {}
        html = _render_table(spec, items, res, engine._ev, agg)
        return f'<div class="cr-table" style="{style}">{html}</div>'
    except Exception:
        return (
            f'<div class="cr-table" style="{style};border:1px dashed #aaa;display:flex;align-items:center;'
            f'justify-content:center"><span style="font-size:7pt;color:#888">⊞ Table</span></div>'
        )


def render_subreport_el(engine, el, res) -> str:
    style = f"position:absolute;left:{el.x}px;top:{el.y}px;width:{el.w}px;height:{el.h}px;z-index:{el.zIndex}"
    try:
        from .subreport import render_subreport as _render_subreport

        spec = el.__dict__ if hasattr(el, "__dict__") else {}
        html = _render_subreport(spec, engine._data, res, engine._ev)
        return f'<div class="cr-subreport" style="{style}">{html}</div>'
    except Exception:
        target = getattr(el, "target", "") or getattr(el, "layoutPath", "") or "subreport"
        return (
            f'<div class="cr-subreport" style="{style};display:flex;align-items:center;justify-content:center">'
            f'<span style="font-size:7pt;color:#777">↗ {_esc(str(target))}</span></div>'
        )
