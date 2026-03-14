# core/render/engines/subreport.py
# Subreport rendering — embeds one report inside another.
from __future__ import annotations
import json
from pathlib import Path
from typing import Any


def render_subreport(spec: dict, parent_data: dict, resolver,
                     evaluator, parent_path: Path = None) -> str:
    """
    Render an embedded subreport and return its HTML fragment.
    
    spec keys:
      type:       "subreport"
      layoutPath: path to .rfd.json (relative to parent or absolute)
      dataPath:   dot-path into parent data for child items (e.g. "items")
      data:       inline data dict (alternative to dataPath)
      x,y,w,h:   position
      dataSource: inline data spec or URL
    """
    from ..engines.advanced_engine import AdvancedHtmlEngine

    x = spec.get("x", 0)
    y = spec.get("y", 0)
    w = spec.get("w", 400)
    h = spec.get("h", 300)

    # Resolve layout
    layout_path = spec.get("layoutPath", "")
    if not layout_path:
        return _placeholder(x, y, w, h, "subreport: no layoutPath")
    lp = Path(layout_path)
    if not lp.is_absolute() and parent_path:
        lp = parent_path.parent / lp
    if not lp.exists():
        return _placeholder(x, y, w, h, f"subreport layout not found: {layout_path}")

    try:
        layout_raw = json.loads(lp.read_text(encoding="utf-8"))
    except Exception as e:
        return _placeholder(x, y, w, h, f"subreport layout error: {e}")

    # Resolve data
    if "data" in spec:
        child_data = spec["data"]
    elif "dataPath" in spec:
        child_data = _resolve_path(spec["dataPath"], parent_data)
        if isinstance(child_data, list):
            child_data = {"items": child_data}
        elif not isinstance(child_data, dict):
            child_data = {"items": []}
    elif "dataSource" in spec:
        from ..datasource import DataSource
        child_data = DataSource.load(spec["dataSource"])
    else:
        child_data = parent_data  # use same data

    try:
        engine = AdvancedHtmlEngine(layout_raw, child_data, debug=False)
        # Render body only (no full HTML envelope)
        inner_html = engine._pages()
    except Exception as e:
        return _placeholder(x, y, w, h, f"subreport render error: {e}")

    # Wrap in positioned container
    st = (f"position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;"
          f"overflow:hidden;")
    return f'<div style="{st}" data-subreport="{layout_path}">{inner_html}</div>'


def _resolve_path(path: str, data: dict) -> Any:
    """Resolve dot-path in data dict."""
    parts = path.strip().split(".")
    cur = data
    for p in parts:
        if isinstance(cur, dict):
            cur = cur.get(p, {})
        else:
            return {}
    return cur


def _placeholder(x, y, w, h, msg):
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;'
            f'background:#FFF9C4;border:1px dashed #999;display:flex;align-items:center;'
            f'justify-content:center;font-size:7pt;color:#666;">[{msg}]</div>')
