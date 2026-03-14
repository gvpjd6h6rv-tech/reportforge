# core/render/styles.py
# Reusable style registry — fonts, colors, borders.
# Styles are resolved by name and merged into elements at render time.
from __future__ import annotations
from typing import Any

# ── Built-in style library ─────────────────────────────────────────
_BUILTIN: dict[str, dict] = {
    # Typography
    "heading1":       {"fontSize":16, "bold":True,  "color":"#1A1A2E"},
    "heading2":       {"fontSize":13, "bold":True,  "color":"#16213E"},
    "heading3":       {"fontSize":11, "bold":True,  "color":"#0F3460"},
    "body":           {"fontSize":9,  "bold":False, "color":"#333333"},
    "caption":        {"fontSize":7,  "bold":False, "italic":True, "color":"#666666"},
    "label":          {"fontSize":8,  "bold":True,  "color":"#444444"},
    "monospace":      {"fontFamily":"Courier New", "fontSize":8},

    # Numbers
    "currency":       {"align":"right", "fieldFmt":"currency"},
    "currency_sign":  {"align":"right", "fieldFmt":"currency_sign"},
    "integer":        {"align":"right", "fieldFmt":"int"},
    "percentage":     {"align":"right", "fieldFmt":"pct"},

    # Backgrounds
    "highlight":      {"bgColor":"#FFF9C4"},
    "row_alternate":  {"bgColor":"#F4F4F2"},
    "header_bg":      {"bgColor":"#1A1A2E", "color":"#FFFFFF", "bold":True},
    "success_bg":     {"bgColor":"#E8F5E9"},
    "warning_bg":     {"bgColor":"#FFF3E0"},
    "danger_bg":      {"bgColor":"#FFEBEE"},

    # Borders
    "box":            {"borderWidth":1, "borderStyle":"solid", "borderColor":"#CCCCCC"},
    "box_strong":     {"borderWidth":2, "borderStyle":"solid", "borderColor":"#333333"},
    "underline_only": {"borderWidth":1, "borderStyle":"solid", "borderColor":"#CCCCCC"},

    # Colors (aliases)
    "primary":        {"color":"#1A1A2E"},
    "secondary":      {"color":"#16213E"},
    "accent":         {"color":"#E94560"},
    "muted":          {"color":"#888888"},
    "success":        {"color":"#2E7D32"},
    "warning":        {"color":"#E65100"},
    "danger":         {"color":"#C62828"},
}


class StyleRegistry:
    """
    Named style library. Styles cascade: built-in → user-defined → inline.
    """
    def __init__(self, user_styles: dict = None):
        self._styles: dict[str, dict] = dict(_BUILTIN)
        if user_styles:
            self._styles.update(user_styles)

    def register(self, name: str, props: dict) -> None:
        self._styles[name] = props

    def resolve(self, name: str) -> dict:
        return dict(self._styles.get(name, {}))

    def apply(self, element_raw: dict) -> dict:
        """Apply named style to element raw dict, respecting inline overrides."""
        style_name = element_raw.get("style") or element_raw.get("styleName")
        if not style_name:
            return element_raw
        base = self.resolve(style_name)
        # Inline properties override the named style
        merged = {**base, **{k: v for k, v in element_raw.items()
                              if v is not None and k not in ("style", "styleName")}}
        return merged

    def list_styles(self) -> list[str]:
        return sorted(self._styles.keys())

    def css_variables(self) -> str:
        """Emit :root CSS variables for named colors."""
        lines = [":root {"]
        for name, props in self._styles.items():
            if "color" in props and props["color"].startswith("#"):
                css_name = name.replace("_", "-")
                lines.append(f"  --rf-{css_name}-color: {props['color']};")
            if "bgColor" in props and props["bgColor"].startswith("#"):
                css_name = name.replace("_", "-")
                lines.append(f"  --rf-{css_name}-bg: {props['bgColor']};")
        lines.append("}")
        return "\n".join(lines)


# Global default registry
DEFAULT_REGISTRY = StyleRegistry()
