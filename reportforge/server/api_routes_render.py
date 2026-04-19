from __future__ import annotations

import time
from pathlib import Path

from reportforge.core.render.datasource import DataSource
from reportforge.core.render.engines.enterprise_engine import EnterpriseEngine, render_preview
from reportforge.core.render.jrxml_parser import render_from_jrxml
from reportforge.server.tenant import get_tenant
from .api_contracts import RenderRequest, JrxmlRenderRequest, PreviewRequest, HTMLResponse, HTTPException, Response
from .api_helpers import _resolve_layout, _format_response, load_data


def register_render_routes(app, cache):
    @app.post("/render", tags=["Render"], summary="Render layout + data → PDF / HTML / PNG / DOCX / RTF")
    async def _post_render(req: RenderRequest):
        t0 = time.perf_counter()
        layout = _resolve_layout(req.layout, req.tenant, cache)
        data = load_data(req.data, allow_dict_spec=True)
        tenant_cfg = get_tenant(req.tenant)
        styles = {**tenant_cfg.styles, **(req.params.get("_styles") or {})}
        params = {**tenant_cfg.params, **req.params}
        fmt = (req.format or "pdf").lower()
        if fmt in ("docx", "rtf"):
            import tempfile
            from reportforge.core.render.export.exporters import Exporter
            ex = Exporter(layout, data, debug=req.debug)
            suffix = f".{fmt}"
            mime_map = {
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "rtf": "application/rtf",
            }
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp_path = tmp.name
            try:
                getattr(ex, f"to_{fmt}")(tmp_path)
                out_bytes = Path(tmp_path).read_bytes()
            except Exception as e:
                raise HTTPException(status_code=422, detail=f"{fmt.upper()} export error: {e}")
            finally:
                try:
                    Path(tmp_path).unlink()
                except OSError:
                    pass
            mime_map = {
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "rtf": "application/rtf",
            }
            return Response(
                content=out_bytes,
                media_type=mime_map[fmt],
                headers={"Content-Disposition": f'attachment; filename="report.{fmt}"'},
            )
        try:
            engine = EnterpriseEngine(layout, data, params=params, debug=req.debug, styles=styles if styles else None)
            html = engine.render()
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Render error: {e}")
        ms = (time.perf_counter() - t0) * 1000
        import logging
        logging.getLogger("reportforge.api").info("render  tenant=%s fmt=%s  %.0fms", req.tenant, req.format, ms)
        return _format_response(html, fmt, req.layout, data)

    @app.post("/render-jrxml", tags=["Render"], summary="Render JRXML report → PDF / HTML")
    async def _post_render_jrxml(req: JrxmlRenderRequest):
        jrxml_path = Path(req.jrxml)
        if not jrxml_path.exists():
            raise HTTPException(status_code=404, detail=f"JRXML not found: {req.jrxml}")
        data = load_data(req.data, allow_dict_spec=True)
        tenant_cfg = get_tenant(req.tenant)
        params = {**tenant_cfg.params, **req.params}
        try:
            html = render_from_jrxml(data, jrxml_path, params=params)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"JRXML render error: {e}")
        return _format_response(html, req.format, req.jrxml, data)

    @app.post("/preview", tags=["Render"], summary="Fast HTML preview (no PDF generation)")
    async def _post_preview(req: PreviewRequest):
        layout = _resolve_layout(req.layout, req.tenant, cache)
        data = load_data(req.data, allow_dict_spec=False)
        tenant_cfg = get_tenant(req.tenant)
        params = {**tenant_cfg.params, **req.params}
        try:
            html = render_preview(layout, data, params=params, preview=True)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Preview error: {e}")
        return HTMLResponse(content=html)

    @app.post("/designer-preview", tags=["Designer"], summary="Live designer preview — layout JSON inline")
    async def _post_designer_preview(req: PreviewRequest):
        if not isinstance(req.layout, dict):
            raise HTTPException(status_code=400, detail="designer-preview requires layout as JSON object, not file path")
        data = req.data or {}
        try:
            html = render_preview(req.layout, data, params=req.params, preview=True)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Designer preview error: {e}")
        return HTMLResponse(content=html)
