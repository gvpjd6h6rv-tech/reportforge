# server/tenant.py
# Multi-tenant theme and configuration engine.
# Each tenant can have: custom CSS theme, logo, default params, layout overrides.
from __future__ import annotations
import json, os
from pathlib import Path
from typing import Optional

_THEMES_DIR = Path(__file__).parent / "themes"
_REGISTRY_DIR = Path(__file__).parent / "templates_registry"


# ── Built-in themes ───────────────────────────────────────────────
_BUILTIN_THEMES: dict[str, dict] = {
    "default": {
        "primaryColor":   "#1A1A2E",
        "accentColor":    "#E94560",
        "bgColor":        "#FFFFFF",
        "fontFamily":     "Arial",
        "fontSize":       9,
        "headerBg":       "#1A1A2E",
        "headerColor":    "#FFFFFF",
        "altRowBg":       "#F4F4F2",
        "borderColor":    "#CCCCCC",
        "logo":           "",
    },
    "ocean": {
        "primaryColor":   "#0077B6",
        "accentColor":    "#00B4D8",
        "bgColor":        "#F0F9FF",
        "fontFamily":     "Arial",
        "fontSize":       9,
        "headerBg":       "#0077B6",
        "headerColor":    "#FFFFFF",
        "altRowBg":       "#E0F2FE",
        "borderColor":    "#BAE6FD",
        "logo":           "",
    },
    "forest": {
        "primaryColor":   "#1B4332",
        "accentColor":    "#40916C",
        "bgColor":        "#F0FDF4",
        "fontFamily":     "Arial",
        "fontSize":       9,
        "headerBg":       "#1B4332",
        "headerColor":    "#FFFFFF",
        "altRowBg":       "#DCFCE7",
        "borderColor":    "#BBF7D0",
        "logo":           "",
    },
    "corporate": {
        "primaryColor":   "#1E293B",
        "accentColor":    "#3B82F6",
        "bgColor":        "#FFFFFF",
        "fontFamily":     "Arial",
        "fontSize":       9,
        "headerBg":       "#1E293B",
        "headerColor":    "#FFFFFF",
        "altRowBg":       "#F1F5F9",
        "borderColor":    "#CBD5E1",
        "logo":           "",
    },
}


class TenantConfig:
    """
    Holds theme + settings for a single tenant.
    Loads from: themes/{tenant}.json → falls back to builtin → 'default'.
    """
    def __init__(self, tenant_id: str = "default"):
        self.tenant_id = tenant_id
        self._cfg      = self._load(tenant_id)

    # ── Properties ────────────────────────────────────────────────
    @property
    def theme(self) -> dict:
        return self._cfg.get("theme", _BUILTIN_THEMES["default"])

    @property
    def params(self) -> dict:
        return self._cfg.get("params", {})

    @property
    def styles(self) -> dict:
        return self._cfg.get("styles", {})

    @property
    def logo_url(self) -> str:
        return self._cfg.get("theme", {}).get("logo", "")

    @property
    def primary_color(self) -> str:
        return self._cfg.get("theme", {}).get("primaryColor", "#1A1A2E")

    def css_overrides(self) -> str:
        """Generate CSS variable overrides for this tenant's theme."""
        t = self.theme
        lines = [":root {"]
        for k, v in t.items():
            if isinstance(v, str) and (v.startswith("#") or v in ("Arial", "Helvetica")):
                css_k = "".join(f"-{c.lower()}" if c.isupper() else c for c in k)
                lines.append(f"  --tenant-{css_k}: {v};")
        lines.append("}")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        return {
            "tenant_id": self.tenant_id,
            "theme":     self.theme,
            "params":    self.params,
            "styles":    self.styles,
        }

    # ── Loaders ───────────────────────────────────────────────────
    def _load(self, tenant_id: str) -> dict:
        # 1) File-based config
        p = _THEMES_DIR / f"{tenant_id}.json"
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                pass
        # 2) Env-based theme selection
        env_theme = os.environ.get(f"RF_THEME_{tenant_id.upper()}", "")
        if env_theme and env_theme in _BUILTIN_THEMES:
            return {"theme": _BUILTIN_THEMES[env_theme]}
        # 3) Builtin theme matching tenant name
        if tenant_id in _BUILTIN_THEMES:
            return {"theme": _BUILTIN_THEMES[tenant_id]}
        # 4) Default
        return {"theme": _BUILTIN_THEMES["default"]}


# ── Template Registry ─────────────────────────────────────────────

class TemplateRegistry:
    """
    Stores layout JSON keyed by templateId, optionally per tenant.
    Backed by JSON files in templates_registry/ directory.
    """
    def __init__(self):
        _REGISTRY_DIR.mkdir(parents=True, exist_ok=True)

    def register(self, template_id: str, layout: dict,
                 tenant: str = "default") -> None:
        """Save a layout under a named template ID."""
        key  = f"{tenant}:{template_id}"
        path = _REGISTRY_DIR / f"{key.replace(':', '__')}.json"
        path.write_text(json.dumps(layout, indent=2, ensure_ascii=False),
                        encoding="utf-8")

    def get(self, template_id: str, tenant: str = "default") -> Optional[dict]:
        """Retrieve a layout by template ID."""
        key  = f"{tenant}:{template_id}"
        path = _REGISTRY_DIR / f"{key.replace(':', '__')}.json"
        if not path.exists():
            # Try global (default tenant)
            path = _REGISTRY_DIR / f"default__{template_id}.json"
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return None
        return None

    def list(self, tenant: str = "default") -> list[dict]:
        """List all templates available for tenant (includes default)."""
        result = []
        for p in sorted(_REGISTRY_DIR.glob("*.json")):
            parts = p.stem.replace("__", ":", 1).split(":", 1)
            t_id   = parts[0]
            tpl_id = parts[1] if len(parts) > 1 else parts[0]
            if t_id in (tenant, "default"):
                result.append({
                    "templateId": tpl_id,
                    "tenant":     t_id,
                    "file":       p.name,
                })
        return result

    def delete(self, template_id: str, tenant: str = "default") -> bool:
        key  = f"{tenant}:{template_id}"
        path = _REGISTRY_DIR / f"{key.replace(':', '__')}.json"
        if path.exists():
            path.unlink()
            return True
        return False


# Global singletons
_registry = TemplateRegistry()

def get_registry() -> TemplateRegistry:
    return _registry

def get_tenant(tenant_id: str = "default") -> TenantConfig:
    return TenantConfig(tenant_id)
