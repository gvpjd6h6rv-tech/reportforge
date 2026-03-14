# core/render/features/subreports.py
# Subreport element: embeds a child layout inside a parent report section.
# The child layout is rendered independently and its HTML is inlined.
from __future__ import annotations
import json
from pathlib import Path
from typing import Any


class SubreportRenderer:
    """
    Renders subreport elements.

    Element definition:
        {
            "type": "subreport",
            "x": 4, "y": 40,
            "w": 700, "h": 0,          # h=0 → auto-height (canGrow)
            "layoutPath": "layouts/items_detail.rfd.json",
            "dataPath": "sub_items",    # path into parent data, or inline
            "dataExpr": "items",        # alternative: expression
            "params": {                  # override params passed to child
                "showHeader": true
            }
        }

    Also supports inline layout:
        {
            "type": "subreport",
            "layout": { ... },          # inline layout dict
            "data": [ ... ]             # inline data list
        }
    """

    def __init__(self, base_dir: Path | None = None):
        self._base_dir = base_dir or Path(".")
        self._cache: dict[str, dict] = {}

    def render(self, el_raw: dict, parent_data: dict,
               parent_resolver, debug: bool = False) -> str:
        """Return fully rendered HTML for this subreport."""
        from ..engines.advanced_engine import AdvancedHtmlEngine

        # Resolve layout
        layout = self._resolve_layout(el_raw)
        if layout is None:
            return self._error(el_raw, "layout not found")

        # Resolve data
        data = self._resolve_data(el_raw, parent_data, parent_resolver)

        x = int(el_raw.get("x", 0))
        y = int(el_raw.get("y", 0))
        w = int(el_raw.get("w", 700))

        # Apply params overrides to layout
        params = el_raw.get("params", {})
        if params:
            layout = {**layout, **params}

        try:
            engine = AdvancedHtmlEngine(layout, data, debug=debug)
            inner_html = engine.render()
            # Extract just the body content (strip outer html/head/body)
            body = _extract_body(inner_html)
            # Wrap in positioned div
            st = f"position:absolute;left:{x}px;top:{y}px;width:{w}px;overflow:visible"
            return f'<div class="rf-subreport" style="{st}">{body}</div>'
        except Exception as e:
            return self._error(el_raw, str(e))

    def _resolve_layout(self, el_raw: dict) -> dict | None:
        # Inline layout
        if "layout" in el_raw:
            return el_raw["layout"]
        # File path
        path_str = el_raw.get("layoutPath", "")
        if not path_str:
            return None
        path = Path(path_str)
        if not path.is_absolute():
            path = self._base_dir / path
        key = str(path.resolve())
        if key not in self._cache:
            try:
                self._cache[key] = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return None
        return self._cache[key]

    def _resolve_data(self, el_raw: dict, parent_data: dict,
                       resolver) -> dict:
        # Inline data
        if "data" in el_raw:
            raw = el_raw["data"]
            if isinstance(raw, list):
                return {"items": raw}
            return raw

        # Expression / path
        path = el_raw.get("dataPath") or el_raw.get("dataExpr", "")
        if not path:
            return parent_data

        val = resolver.get(path) if path else None
        if val is None:
            # Try dot-path traversal
            val = _dig(parent_data, path)

        if isinstance(val, list):
            return {**parent_data, "items": val}
        if isinstance(val, dict):
            return {**parent_data, **val}
        return parent_data

    def _error(self, el_raw: dict, msg: str) -> str:
        x = el_raw.get("x", 0); y = el_raw.get("y", 0)
        w = el_raw.get("w", 200); h = el_raw.get("h", 20)
        import html
        return (f'<div style="position:absolute;left:{x}px;top:{y}px;'
                f'width:{w}px;height:{h}px;border:1px dashed red;'
                f'background:#fff0f0;font-size:7pt;color:red;padding:2px">'
                f'Subreport error: {html.escape(msg)}</div>')


def _extract_body(html: str) -> str:
    """Extract content between <body> and </body>."""
    import re
    m = re.search(r'<body[^>]*>(.*)</body>', html, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else html


def _dig(obj: Any, path: str) -> Any:
    cur = obj
    for k in path.split("."):
        if isinstance(cur, dict): cur = cur.get(k)
        else: return None
    return cur
