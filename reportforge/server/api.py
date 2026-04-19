from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from .api_contracts import (
    _HAS_FASTAPI,
    BackgroundTasks,
    BarcodePreviewRequest,
    BaseModel,
    CORSMiddleware,
    DatasourceRegisterRequest,
    Field,
    FormulaValidateRequest,
    HTMLResponse,
    HTTPException,
    JSONResponse,
    PreviewRequest,
    RegisterTemplateRequest,
    RenderRequest,
    Request,
    Response,
    StreamingResponse,
    TemplateRenderRequest,
    TenantThemeRequest,
    JrxmlRenderRequest,
)
from .api_helpers import _format_response, _resolve_layout, _validate
from .api_routes_datasources import register_datasource_routes
from .api_routes_designer import register_designer_routes
from .api_routes_render import register_render_routes
from .api_routes_system import register_system_routes
from .api_routes_templates import register_template_routes
from .api_routes_tenants import register_tenant_routes
from reportforge.core.render.datasource import DataSource
from reportforge.core.render.engines.enterprise_engine import EnterpriseEngine, render_preview
from reportforge.core.render.jrxml_parser import render_from_jrxml, JrxmlParser
from reportforge.server.cache import get_cache, LayoutCache
from reportforge.server.tenant import get_tenant, get_registry

logger = logging.getLogger("reportforge.api")


def create_app() -> "FastAPI":
    if not _HAS_FASTAPI:
        raise ImportError("FastAPI not installed. Run: pip install fastapi uvicorn python-multipart")

    from fastapi import FastAPI

    app = FastAPI(
        title="ReportForge API",
        description="Enterprise reporting engine — Crystal Reports for the cloud.",
        version="2.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    allowed_origins = os.environ.get("RF_CORS_ORIGINS", "*").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    try:
        from reportforge.designer.server import router as designer_router
        app.include_router(designer_router, prefix="/designer")
    except Exception as _de:
        logger.warning("Designer router not loaded: %s", _de)

    cache = get_cache()
    registry = get_registry()

    @app.middleware("http")
    async def _timing(request: Request, call_next):
        t0 = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - t0) * 1000
        response.headers["X-Render-Time-Ms"] = f"{ms:.1f}"
        return response

    register_system_routes(app, cache)
    register_render_routes(app, cache)
    register_template_routes(app, cache, registry)
    register_tenant_routes(app, cache)
    register_designer_routes(app, cache)
    register_datasource_routes(app)

    return app


__all__ = [
    "create_app",
    "RenderRequest",
    "JrxmlRenderRequest",
    "PreviewRequest",
    "TemplateRenderRequest",
    "RegisterTemplateRequest",
    "TenantThemeRequest",
    "FormulaValidateRequest",
    "BarcodePreviewRequest",
    "DatasourceRegisterRequest",
    "_resolve_layout",
    "_format_response",
    "_validate",
]
