# server/api.py
# ReportForge FastAPI REST API
# Full production server with multi-tenant, caching, template registry.
#
# DO NOT MODIFY RENDER ENGINE — this file only calls existing functions.
from __future__ import annotations

import io, json, logging, os, sys, time
from pathlib import Path
from typing import Any, Optional

# ── stdlib-only typing helpers so the module loads without fastapi ─
try:
    from fastapi import FastAPI, HTTPException, Request, Header, BackgroundTasks
    from fastapi.responses import (
        Response, HTMLResponse, JSONResponse, StreamingResponse
    )
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    _HAS_FASTAPI = True
except ImportError:
    _HAS_FASTAPI = False
    # Stubs so the rest of the file parses and helper functions work without FastAPI
    class BaseModel:                                  # type: ignore
        pass
    def Field(*a, **k): return None                   # type: ignore

    class _ResponseStub:                              # type: ignore
        def __init__(self, content=None, media_type=None, status_code=200, headers=None, **kw):
            self.content      = content
            self.media_type   = media_type
            self.status_code  = status_code
            self.headers      = headers or {}
        @property
        def body(self): return self.content if isinstance(self.content, bytes) else (self.content or "").encode()

    Response         = _ResponseStub                  # type: ignore
    HTMLResponse     = _ResponseStub                  # type: ignore
    JSONResponse     = _ResponseStub                  # type: ignore
    StreamingResponse= _ResponseStub                  # type: ignore

    class HTTPException(Exception):                   # type: ignore
        def __init__(self, status_code=500, detail=""):
            self.status_code = status_code
            self.detail      = detail
            super().__init__(detail)

# ── Add project root to path ──────────────────────────────────────
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# ── Internal imports ──────────────────────────────────────────────
from reportforge.core.render.engines.enterprise_engine import EnterpriseEngine, render_preview
from reportforge.core.render.jrxml_parser             import render_from_jrxml, JrxmlParser
from reportforge.core.render.datasource               import DataSource
from reportforge.server.cache                         import get_cache, LayoutCache
from reportforge.server.tenant                        import get_tenant, get_registry

logger = logging.getLogger("reportforge.api")

# ── Request/Response models ───────────────────────────────────────

class RenderRequest(BaseModel):
    layout:     Any              = Field(...,  description="Layout dict or file path string")
    data:       Any              = Field({},   description="Report data dict or URL")
    params:     dict             = Field({},   description="Report parameters")
    tenant:     str              = Field("default", description="Tenant ID for theme")
    debug:      bool             = Field(False)
    format:     str              = Field("pdf", description="pdf | html | png | csv | xlsx")

class JrxmlRenderRequest(BaseModel):
    jrxml:      str              = Field(...,  description="Path to .jrxml file")
    data:       Any              = Field({},   description="Report data dict or URL")
    params:     dict             = Field({},   description="Report parameters")
    tenant:     str              = Field("default")
    format:     str              = Field("pdf")

class PreviewRequest(BaseModel):
    layout:     Any              = Field(...,  description="Layout dict or file path string")
    data:       Any              = Field({},   description="Report data")
    params:     dict             = Field({})
    tenant:     str              = Field("default")

class TemplateRenderRequest(BaseModel):
    templateId: str              = Field(...,  description="Registered template ID")
    data:       Any              = Field({},   description="Report data")
    params:     dict             = Field({})
    tenant:     str              = Field("default")
    format:     str              = Field("pdf")

class RegisterTemplateRequest(BaseModel):
    templateId: str
    layout:     dict
    tenant:     str              = Field("default")

class TenantThemeRequest(BaseModel):
    theme:      dict
    params:     dict             = Field({})
    styles:     dict             = Field({})

# ── Phase 5: Designer / Datasource models ────────────────────────

class FormulaValidateRequest(BaseModel):
    formula:    str              = Field(...,  description="CR formula expression to validate")
    fields:     list             = Field([],   description="Known field names for context")
    sample:     dict             = Field({},   description="Sample data item for eval test")

class BarcodePreviewRequest(BaseModel):
    value:      str              = Field("RF-001", description="Value to encode")
    barcodeType:str              = Field("code128", description="code128 | ean13 | qr | code39")
    width:      int              = Field(200)
    height:     int              = Field(80)
    showText:   bool             = Field(True)

class DatasourceRegisterRequest(BaseModel):
    alias:      str              = Field(...,  description="Unique name for this datasource")
    type:       str              = Field("sqlite", description="sqlite | db | rest | json")
    url:        str              = Field("",   description="SQLAlchemy URL or file path")
    query:      str              = Field("",   description="Default SQL query")
    params:     dict             = Field({})
    ttl:        int              = Field(300,  description="Cache TTL in seconds")


# ── App factory ───────────────────────────────────────────────────

def create_app() -> "FastAPI":
    if not _HAS_FASTAPI:
        raise ImportError(
            "FastAPI not installed. Run: pip install fastapi uvicorn python-multipart"
        )

    app = FastAPI(
        title       = "ReportForge API",
        description = "Enterprise reporting engine — Crystal Reports for the cloud.",
        version     = "2.0.0",
        docs_url    = "/docs",
        redoc_url   = "/redoc",
    )

    # ── CORS ──────────────────────────────────────────────────────
    allowed_origins = os.environ.get("RF_CORS_ORIGINS", "*").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins     = allowed_origins,
        allow_credentials = True,
        allow_methods     = ["*"],
        allow_headers     = ["*"],
    )

    # ── Mount designer router ─────────────────────────────────────
    try:
        from reportforge.designer.server import router as designer_router
        app.include_router(designer_router, prefix="/designer")
    except Exception as _de:
        import logging; logging.getLogger("reportforge").warning("Designer router not loaded: %s", _de)

    cache    = get_cache()
    registry = get_registry()

    # ── Middleware: request timing ─────────────────────────────────
    @app.middleware("http")
    async def _timing(request: Request, call_next):
        t0 = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - t0) * 1000
        response.headers["X-Render-Time-Ms"] = f"{ms:.1f}"
        return response

    # ── Health ────────────────────────────────────────────────────
    @app.get("/health", tags=["System"])
    async def health():
        return {
            "status":  "ok",
            "version": "2.0.0",
            "cache":   cache.stats(),
        }

    @app.get("/cache/stats", tags=["System"])
    async def cache_stats():
        return cache.stats()

    @app.delete("/cache", tags=["System"])
    async def cache_clear(tenant: str = "default"):
        n = cache.clear(tenant)
        return {"cleared": n, "tenant": tenant}

    @app.post("/render", tags=["Render"],
              summary="Render layout + data → PDF / HTML / PNG / DOCX / RTF")
    async def render(req: RenderRequest):
        t0 = time.perf_counter()

        layout = _resolve_layout(req.layout, req.tenant, cache)
        data   = DataSource.load(req.data) if isinstance(req.data, (str, dict)) and req.data else (req.data or {})
        tenant_cfg = get_tenant(req.tenant)
        styles = {**tenant_cfg.styles, **(req.params.get("_styles") or {})}
        params = {**tenant_cfg.params, **req.params}

        fmt = (req.format or "pdf").lower()

        # DOCX / RTF don't need HTML; handle them directly
        if fmt in ("docx", "rtf"):
            import tempfile
            from reportforge.core.render.export.exporters import Exporter
            ex = Exporter(layout, data, debug=req.debug)
            suffix = f".{fmt}"
            mime_map = {
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "rtf":  "application/rtf",
            }
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp_path = tmp.name
            try:
                getattr(ex, f"to_{fmt}")(tmp_path)
                out_bytes = Path(tmp_path).read_bytes()
            except Exception as e:
                raise HTTPException(status_code=422, detail=f"{fmt.upper()} export error: {e}")
            finally:
                try: Path(tmp_path).unlink()
                except OSError: pass
            return Response(
                content    = out_bytes,
                media_type = mime_map[fmt],
                headers    = {"Content-Disposition": f'attachment; filename="report.{fmt}"'},
            )

        try:
            engine = EnterpriseEngine(
                layout, data,
                params=params, debug=req.debug,
                styles=styles if styles else None,
            )
            html = engine.render()
        except Exception as e:
            logger.error("Render failed: %s", e, exc_info=True)
            raise HTTPException(status_code=422, detail=f"Render error: {e}")

        ms = (time.perf_counter() - t0) * 1000
        logger.info("render  tenant=%s fmt=%s  %.0fms", req.tenant, req.format, ms)

        return _format_response(html, fmt, req.layout, data)

    # ── POST /render-jrxml ────────────────────────────────────────
    @app.post("/render-jrxml", tags=["Render"],
              summary="Render JRXML report → PDF / HTML")
    async def render_jrxml(req: JrxmlRenderRequest):
        jrxml_path = Path(req.jrxml)
        if not jrxml_path.exists():
            raise HTTPException(status_code=404, detail=f"JRXML not found: {req.jrxml}")

        data = DataSource.load(req.data) if req.data else {}
        tenant_cfg = get_tenant(req.tenant)
        params = {**tenant_cfg.params, **req.params}

        try:
            html = render_from_jrxml(data, jrxml_path, params=params)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"JRXML render error: {e}")

        return _format_response(html, req.format, req.jrxml, data)

    # ── POST /preview ─────────────────────────────────────────────
    @app.post("/preview", tags=["Render"],
              summary="Fast HTML preview (no PDF generation)")
    async def preview(req: PreviewRequest):
        layout = _resolve_layout(req.layout, req.tenant, cache)
        data   = DataSource.load(req.data) if isinstance(req.data, str) else (req.data or {})
        tenant_cfg = get_tenant(req.tenant)
        params = {**tenant_cfg.params, **req.params}

        try:
            html = render_preview(layout, data, params=params, preview=True)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Preview error: {e}")

        return HTMLResponse(content=html)

    # ── POST /designer-preview ────────────────────────────────────
    @app.post("/designer-preview", tags=["Designer"],
              summary="Live designer preview — layout JSON inline")
    async def designer_preview(req: PreviewRequest):
        """
        Used by the visual designer to render live previews.
        Accepts a full layout dict directly (not file path).
        Returns HTML with preview CSS (box-shadow, no @page).
        """
        if not isinstance(req.layout, dict):
            raise HTTPException(status_code=400,
                detail="designer-preview requires layout as JSON object, not file path")

        data = req.data or {}
        try:
            html = render_preview(req.layout, data, params=req.params, preview=True)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Designer preview error: {e}")

        return HTMLResponse(content=html)

    # ── POST /render-template ─────────────────────────────────────
    @app.post("/render-template", tags=["Templates"],
              summary="Render a registered template by ID")
    async def render_template(req: TemplateRenderRequest):
        layout = registry.get(req.templateId, req.tenant)
        if not layout:
            raise HTTPException(status_code=404,
                detail=f"Template '{req.templateId}' not found for tenant '{req.tenant}'")

        data   = DataSource.load(req.data) if isinstance(req.data, str) else (req.data or {})
        tenant_cfg = get_tenant(req.tenant)
        params = {**tenant_cfg.params, **req.params}

        try:
            engine = EnterpriseEngine(layout, data, params=params,
                                      styles=tenant_cfg.styles or None)
            html = engine.render()
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Template render error: {e}")

        return _format_response(html, req.format, req.templateId, data)

    # ── Template Registry CRUD ────────────────────────────────────
    @app.post("/templates", tags=["Templates"], status_code=201,
              summary="Register a layout as a named template")
    async def register_template(req: RegisterTemplateRequest):
        registry.register(req.templateId, req.layout, req.tenant)
        cache_key = LayoutCache.make_key(req.layout, req.tenant)
        cache.set(cache_key, req.layout)
        return {
            "templateId": req.templateId,
            "tenant":     req.tenant,
            "status":     "registered",
        }

    @app.get("/templates", tags=["Templates"],
             summary="List registered templates")
    async def list_templates(tenant: str = "default"):
        return registry.list(tenant)

    @app.delete("/templates/{template_id}", tags=["Templates"])
    async def delete_template(template_id: str, tenant: str = "default"):
        ok = registry.delete(template_id, tenant)
        if not ok:
            raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
        return {"deleted": template_id, "tenant": tenant}

    # ── Tenant Theme API ──────────────────────────────────────────
    @app.get("/tenants/{tenant_id}/theme", tags=["Tenants"],
             summary="Get tenant theme configuration")
    async def get_theme(tenant_id: str):
        return get_tenant(tenant_id).to_dict()

    @app.put("/tenants/{tenant_id}/theme", tags=["Tenants"],
             summary="Update tenant theme (writes themes/{tenant}.json)")
    async def update_theme(tenant_id: str, req: TenantThemeRequest):
        from server.tenant import _THEMES_DIR
        _THEMES_DIR.mkdir(parents=True, exist_ok=True)
        cfg = {"theme": req.theme, "params": req.params, "styles": req.styles}
        (_THEMES_DIR / f"{tenant_id}.json").write_text(
            json.dumps(cfg, indent=2), encoding="utf-8"
        )
        cache.clear(tenant_id)
        return {"tenant": tenant_id, "status": "updated"}

    # ── Layout Validation ─────────────────────────────────────────
    @app.post("/validate", tags=["Designer"],
              summary="Validate a layout JSON and return warnings")
    async def validate_layout(layout: dict):
        warnings = _validate(layout)
        return {
            "valid":    len(warnings) == 0,
            "warnings": warnings,
        }

    # ── Phase 5: Formula Validation ───────────────────────────────
    @app.post("/validate-formula", tags=["Designer"],
              summary="Validate and test-evaluate a CR formula expression")
    async def validate_formula(req: FormulaValidateRequest):
        """
        Parse and optionally evaluate a Crystal Reports formula.
        Returns: {valid, errors, result, suggestions}
        """
        from reportforge.core.render.expressions.evaluator    import ExpressionEvaluator
        from reportforge.core.render.expressions.cr_functions import is_cr_function
        from reportforge.core.render.resolvers.field_resolver import FieldResolver
        import re as _re

        errors: list[str] = []
        suggestions: list[str] = []
        result = None

        formula = req.formula.strip()
        if not formula:
            return {"valid": False, "errors": ["Formula is empty"], "result": None, "suggestions": []}

        # 1) Static checks: balanced braces/parens
        depth = 0
        for ch in formula:
            if ch == "(": depth += 1
            elif ch == ")": depth -= 1
            if depth < 0:
                errors.append("Unmatched closing parenthesis ')'")
                break
        if depth > 0:
            errors.append(f"Unclosed parenthesis — {depth} '(' without matching ')'")

        brace_depth = 0
        for ch in formula:
            if ch == "{": brace_depth += 1
            elif ch == "}": brace_depth -= 1
            if brace_depth < 0:
                errors.append("Unmatched closing brace '}'")
                break
        if brace_depth > 0:
            errors.append("Unclosed field reference '{' — missing '}'")

        # 2) Check for unknown function names
        fn_names = _re.findall(r'\b([a-zA-Z_]\w*)\s*\(', formula)
        _KNOWN_BUILTINS = {
            "sum","count","avg","min","max","first","last","runningsum","runningcount",
            "if","iif","choose","switch","inrange","inlist",
        }
        for fn in fn_names:
            fn_l = fn.lower()
            if not is_cr_function(fn_l) and fn_l not in _KNOWN_BUILTINS:
                errors.append(f"Unknown function: '{fn}' — check spelling or CR function reference")
                suggestions.append(f"Did you mean one of: DateAdd, ToText, InStr, Left, Mid, IIF?")

        # 3) Try-eval with sample data (best-effort)
        if not errors and req.sample:
            try:
                items = [req.sample]
                ev = ExpressionEvaluator(items)
                sample_data = {"items": items, **req.sample}
                res = FieldResolver(sample_data).with_item(req.sample)
                result = ev.eval_expr(formula, res)
                result = str(result)
            except Exception as exc:
                errors.append(f"Evaluation error: {exc}")

        # 4) Field reference suggestions
        field_refs = _re.findall(r'\{([^{}]+)\}', formula)
        known_fields = set(req.fields)
        for ref in field_refs:
            if known_fields and ref not in known_fields:
                close = [f for f in known_fields if f.split(".")[-1] == ref.split(".")[-1]]
                if close:
                    suggestions.append(f"Field '{{{{ {ref} }}}}' not in schema — did you mean '{{{close[0]}}}'?")

        return {
            "valid":       len(errors) == 0,
            "errors":      errors,
            "result":      result,
            "suggestions": suggestions,
            "fieldRefs":   field_refs,
            "functions":   list(set(fn_names)),
        }

    # ── Phase 5: Barcode Preview ──────────────────────────────────
    @app.post("/preview-barcode", tags=["Designer"],
              summary="Render barcode value → SVG")
    @app.get("/preview-barcode", tags=["Designer"],
             summary="Render barcode value → SVG (GET)")
    async def preview_barcode(
        value:       str  = "RF-001",
        barcodeType: str  = "code128",
        width:       int  = 200,
        height:      int  = 80,
        showText:    bool = True,
    ):
        """Returns an inline SVG for the requested barcode."""
        from reportforge.core.render.engines.advanced_engine import (
            _render_barcode_svg, _esc
        )
        svg = _render_barcode_svg(value, barcodeType.lower(), width, height, showText)
        return Response(content=svg, media_type="image/svg+xml")

    @app.post("/preview-barcode/body", tags=["Designer"],
              summary="Render barcode from JSON body → SVG")
    async def preview_barcode_body(req: BarcodePreviewRequest):
        from reportforge.core.render.engines.advanced_engine import _render_barcode_svg
        svg = _render_barcode_svg(req.value, req.barcodeType.lower(),
                                  req.width, req.height, req.showText)
        return Response(content=svg, media_type="image/svg+xml")

    # ── Phase 3: Datasource Registry API ─────────────────────────
    @app.get("/datasources", tags=["Datasources"],
             summary="List registered datasources")
    async def list_datasources():
        from reportforge.core.render.datasource.db_source import list_registered
        return list_registered()

    @app.post("/datasources", tags=["Datasources"], status_code=201,
              summary="Register a named datasource connection")
    async def register_datasource(req: DatasourceRegisterRequest):
        from reportforge.core.render.datasource.db_source import register, DbSource
        spec = {
            "type":   req.type,
            "url":    req.url,
            "query":  req.query,
            "params": req.params,
            "ttl":    req.ttl,
        }
        register(req.alias, spec)
        reachable = DbSource.ping(req.url) if req.url else None
        return {
            "alias":     req.alias,
            "status":    "registered",
            "reachable": reachable,
        }

    @app.delete("/datasources/{alias}", tags=["Datasources"])
    async def unregister_datasource(alias: str):
        from reportforge.core.render.datasource.db_source import unregister
        if not unregister(alias):
            raise HTTPException(status_code=404, detail=f"Datasource '{alias}' not found")
        return {"deleted": alias}

    @app.post("/datasources/{alias}/query", tags=["Datasources"],
              summary="Execute a query against a registered datasource")
    async def query_datasource(alias: str, body: dict):
        from reportforge.core.render.datasource.db_source import (
            query_registered, DbSourceError
        )
        try:
            rows = query_registered(
                alias,
                query  = body.get("query"),
                params = body.get("params", {}),
            )
        except DbSourceError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Query error: {e}")
        return {"alias": alias, "count": len(rows), "rows": rows}

    @app.get("/datasources/{alias}/tables", tags=["Datasources"],
             summary="List tables in a registered datasource")
    async def datasource_tables(alias: str):
        from reportforge.core.render.datasource.db_source import (
            get_registered, DbSource, DbSourceError
        )
        spec = get_registered(alias)
        if not spec:
            raise HTTPException(status_code=404, detail=f"Datasource '{alias}' not found")
        try:
            tables = DbSource.list_tables(spec.get("url", ""))
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"alias": alias, "tables": tables}

    @app.get("/datasources/{alias}/tables/{table}/schema", tags=["Datasources"],
             summary="Get column schema for a table")
    async def datasource_table_schema(alias: str, table: str):
        from reportforge.core.render.datasource.db_source import (
            get_registered, DbSource
        )
        spec = get_registered(alias)
        if not spec:
            raise HTTPException(status_code=404, detail=f"Datasource '{alias}' not found")
        try:
            schema = DbSource.table_schema(spec.get("url", ""), table)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"alias": alias, "table": table, "columns": schema}

    return app


# ── Helpers ───────────────────────────────────────────────────────

def _resolve_layout(layout_spec: Any, tenant: str, cache: LayoutCache) -> dict:
    """Resolve layout from dict, file path, or URL, with caching."""
    if isinstance(layout_spec, dict):
        key = LayoutCache.make_key(layout_spec, tenant)
        cached = cache.get(key)
        if cached:
            return cached
        cache.set(key, layout_spec)
        return layout_spec

    if isinstance(layout_spec, str):
        key = LayoutCache.file_key(layout_spec, tenant)
        cached = cache.get(key)
        if cached:
            return cached
        p = Path(layout_spec)
        if p.exists():
            layout = json.loads(p.read_text(encoding="utf-8"))
            cache.set(key, layout)
            return layout
        raise HTTPException(status_code=404, detail=f"Layout file not found: {layout_spec}")

    raise HTTPException(status_code=400, detail="layout must be a dict or file path string")


def _format_response(html: str, fmt: str, name: Any, data: dict):
    """Return the appropriate HTTP response for the requested format."""
    fmt = (fmt or "pdf").lower()

    if fmt == "html":
        return HTMLResponse(content=html)

    if fmt == "pdf":
        try:
            from reportforge.core.render.engines.pdf_generator import PdfGenerator
            buf = io.BytesIO()
            pdf_bytes = PdfGenerator().from_html_to_bytes(html)
            return Response(
                content     = pdf_bytes,
                media_type  = "application/pdf",
                headers     = {"Content-Disposition": f'attachment; filename="report.pdf"'},
            )
        except Exception as e:
            logger.warning("PDF generation failed (%s), returning HTML", e)
            return HTMLResponse(content=html)

    if fmt == "csv":
        from reportforge.core.render.export.csv_export import export_csv
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            export_csv(data, tmp.name)
            csv_bytes = Path(tmp.name).read_bytes()
        return Response(
            content    = csv_bytes,
            media_type = "text/csv",
            headers    = {"Content-Disposition": 'attachment; filename="report.csv"'},
        )

    if fmt == "xlsx":
        from reportforge.core.render.export.xlsx_export import export_xlsx
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            export_xlsx(data, tmp.name)
            xlsx_bytes = Path(tmp.name).read_bytes()
        return Response(
            content    = xlsx_bytes,
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers    = {"Content-Disposition": 'attachment; filename="report.xlsx"'},
        )

    if fmt == "png":
        from reportforge.core.render.export.png_export import export_png
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            export_png(html, tmp.name)
            png_bytes = Path(tmp.name).read_bytes()
        return Response(
            content    = png_bytes,
            media_type = "image/png",
            headers    = {"Content-Disposition": 'attachment; filename="report.png"'},
        )

    if fmt == "docx":
        import tempfile
        # DOCX export needs the original layout/data, not HTML
        # layout_raw and data are passed by the caller — signal via special return
        return JSONResponse(
            status_code=422,
            content={"detail": "DOCX export: call POST /render with format=docx and include layout+data"},
        )

    if fmt == "rtf":
        return JSONResponse(
            status_code=422,
            content={"detail": "RTF export: call POST /render with format=rtf and include layout+data"},
        )

    return HTMLResponse(content=html)


def _validate(layout: dict) -> list[dict]:
    """Return list of {level, message} validation warnings."""
    warnings = []
    w = lambda level, msg: warnings.append({"level": level, "message": msg})

    if not layout.get("sections"):
        w("error", "Layout has no sections defined")
    if not layout.get("elements"):
        w("warning", "Layout has no elements — report will be blank")
    if not layout.get("name"):
        w("info", "Layout has no name — consider adding one")

    # Check each element has a valid sectionId
    section_ids = {s.get("id") for s in layout.get("sections", [])}
    for el in layout.get("elements", []):
        if el.get("sectionId") not in section_ids:
            w("error", f"Element '{el.get('id','')}' references non-existent sectionId '{el.get('sectionId')}'")
        if el.get("type") == "field" and not el.get("fieldPath"):
            w("warning", f"Field element '{el.get('id','')}' has no fieldPath — will render empty")
        if el.get("w", 0) <= 0 or el.get("h", 0) <= 0:
            w("error", f"Element '{el.get('id','')}' has zero or negative dimensions")

    # Page geometry
    pw = layout.get("pageWidth", 794)
    for el in layout.get("elements", []):
        if el.get("x", 0) + el.get("w", 0) > pw:
            w("warning", f"Element '{el.get('id','')}' overflows page width ({pw}px)")

    return warnings
