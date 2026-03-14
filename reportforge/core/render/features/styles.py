# core/render/features/styles.py
# Reusable named styles for fonts, colors, borders.
from __future__ import annotations
from typing import Any

_BUILTIN_STYLES: dict[str, dict] = {
    # Typography
    "h1":       {"fontSize": 18, "bold": True,  "color": "#1A3A6B"},
    "h2":       {"fontSize": 14, "bold": True,  "color": "#1A3A6B"},
    "h3":       {"fontSize": 11, "bold": True,  "color": "#333333"},
    "body":     {"fontSize":  9, "bold": False, "color": "#000000", "fontFamily": "Arial"},
    "small":    {"fontSize":  7, "bold": False, "color": "#555555"},
    "caption":  {"fontSize":  7, "italic": True,"color": "#777777"},
    "mono":     {"fontSize":  8, "fontFamily": "Courier New", "color": "#000000"},
    # Colors
    "primary":  {"color": "#1A3A6B"},
    "secondary": {"color": "#555555"},
    "success":  {"color": "#2E7D32"},
    "danger":   {"color": "#C62828"},
    "warning":  {"color": "#F57F17"},
    "muted":    {"color": "#9E9E9E"},
    # Backgrounds
    "bg-primary":   {"bgColor": "#1A3A6B", "color": "#FFFFFF"},
    "bg-header":    {"bgColor": "#E8EEF8", "color": "#1A3A6B"},
    "bg-alt":       {"bgColor": "#F4F4F2"},
    "bg-highlight": {"bgColor": "#FFF9C4"},
    "bg-danger":    {"bgColor": "#FFEBEE", "color": "#C62828"},
    # Borders
    "border-thin":   {"borderWidth": 1, "borderStyle": "solid",  "borderColor": "#CCCCCC"},
    "border-thick":  {"borderWidth": 2, "borderStyle": "solid",  "borderColor": "#333333"},
    "border-primary":{"borderWidth": 1, "borderStyle": "solid",  "borderColor": "#1A3A6B"},
    "border-dashed": {"borderWidth": 1, "borderStyle": "dashed", "borderColor": "#999999"},
    # Combined
    "table-header": {
        "fontSize": 8, "bold": True, "color": "#FFFFFF",
        "bgColor": "#1A3A6B", "align": "center",
        "borderWidth": 0,
    },
    "table-cell": {
        "fontSize": 8, "bold": False, "color": "#000000",
        "borderWidth": 1, "borderStyle": "solid", "borderColor": "#E0E0E0",
    },
    "total-row": {
        "fontSize": 9, "bold": True, "color": "#1A3A6B",
        "bgColor": "#E8EEF8",
        "borderWidth": 2, "borderStyle": "solid", "borderColor": "#1A3A6B",
    },
    "footer-text": {
        "fontSize": 7, "color": "#9E9E9E", "italic": True,
    },
}

_STYLE_PROPS = {
    "fontSize", "bold", "italic", "underline", "fontFamily",
    "color", "bgColor",
    "borderWidth", "borderStyle", "borderColor",
    "align", "padding",
}


class StyleRegistry:
    """
    Central registry of named styles.
    Supports inheritance and merging.
    """

    def __init__(self, custom: dict[str, dict] | None = None):
        self._styles: dict[str, dict] = dict(_BUILTIN_STYLES)
        if custom:
            for name, props in custom.items():
                self.register(name, props)

    def register(self, name: str, props: dict,
                 inherit: str | None = None) -> None:
        base = dict(self._styles.get(inherit, {})) if inherit else {}
        self._styles[name] = {**base, **props}

    def get(self, name: str) -> dict:
        return dict(self._styles.get(name, {}))

    def resolve(self, element_raw: dict) -> dict:
        """
        Merge named style(s) into element properties.
        Element 'style' field can be a string or list of strings.
        Own properties override named styles.
        """
        style_names = element_raw.get("style") or []
        if isinstance(style_names, str):
            style_names = [s.strip() for s in style_names.split()]
        merged: dict = {}
        for name in style_names:
            merged.update(self._styles.get(name, {}))
        # Element's own props override style
        for prop in _STYLE_PROPS:
            if prop in element_raw and element_raw[prop] is not None:
                merged[prop] = element_raw[prop]
        return {**element_raw, **merged}

    def all_names(self) -> list[str]:
        return sorted(self._styles.keys())

    def css_vars(self) -> str:
        """Emit CSS custom properties for color palette."""
        lines = [":root {"]
        for name, props in self._styles.items():
            if "color" in props:
                css_name = name.replace("-", "_").replace(" ", "_")
                lines.append(f"  --rf-{css_name}: {props['color']};")
        lines.append("}")
        return "\n".join(lines)
