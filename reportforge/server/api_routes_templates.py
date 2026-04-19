from __future__ import annotations

from reportforge.core.render.datasource import DataSource
from reportforge.server.cache import LayoutCache
from reportforge.server.tenant import get_tenant
from .api_contracts import TemplateRenderRequest, RegisterTemplateRequest, HTTPException
from .api_helpers import _format_response, load_data


def register_template_routes(app, cache, registry):
    @app.post("/render-template", tags=["Templates"], summary="Render a registered template by ID")
    async def _post_render_template(req: TemplateRenderRequest):
        layout = registry.get(req.templateId, req.tenant)
        if not layout:
            raise HTTPException(status_code=404, detail=f"Template '{req.templateId}' not found for tenant '{req.tenant}'")
        data = load_data(req.data, allow_dict_spec=False)
        tenant_cfg = get_tenant(req.tenant)
        params = {**tenant_cfg.params, **req.params}
        try:
            from reportforge.core.render.engines.enterprise_engine import EnterpriseEngine
            engine = EnterpriseEngine(layout, data, params=params, styles=tenant_cfg.styles or None)
            html = engine.render()
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Template render error: {e}")
        return _format_response(html, req.format, req.templateId, data)

    @app.post("/templates", tags=["Templates"], status_code=201, summary="Register a layout as a named template")
    async def _post_templates(req: RegisterTemplateRequest):
        registry.register(req.templateId, req.layout, req.tenant)
        cache_key = LayoutCache.make_key(req.layout, req.tenant)
        cache.set(cache_key, req.layout)
        return {"templateId": req.templateId, "tenant": req.tenant, "status": "registered"}

    @app.get("/templates", tags=["Templates"], summary="List registered templates")
    async def _get_templates(tenant: str = "default"):
        return registry.list(tenant)

    @app.delete("/templates/{template_id}", tags=["Templates"])
    async def _delete_template(template_id: str, tenant: str = "default"):
        ok = registry.delete(template_id, tenant)
        if not ok:
            raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
        return {"deleted": template_id, "tenant": tenant}
