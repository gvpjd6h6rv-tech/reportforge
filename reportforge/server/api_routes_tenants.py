from __future__ import annotations

from .api_contracts import TenantThemeRequest
from .api_helpers import HTTPException


def register_tenant_routes(app, cache):
    @app.get("/tenants/{tenant_id}/theme", tags=["Tenants"], summary="Get tenant theme configuration")
    async def _get_theme(tenant_id: str):
        from reportforge.server.tenant import get_tenant
        return get_tenant(tenant_id).to_dict()

    @app.put("/tenants/{tenant_id}/theme", tags=["Tenants"], summary="Update tenant theme (writes themes/{tenant}.json)")
    async def _put_theme(tenant_id: str, req: TenantThemeRequest):
        from reportforge.server.tenant import _THEMES_DIR
        import json
        _THEMES_DIR.mkdir(parents=True, exist_ok=True)
        cfg = {"theme": req.theme, "params": req.params, "styles": req.styles}
        (_THEMES_DIR / f"{tenant_id}.json").write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        cache.clear(tenant_id)
        return {"tenant": tenant_id, "status": "updated"}
