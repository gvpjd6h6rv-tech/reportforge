"""
reportforge/designer/server.py
───────────────────────────────
FastAPI router: serves the self-contained designer HTML and the
/designer/preview endpoint that calls the existing render engine.

All engine imports use full reportforge.* paths to fix:
  ModuleNotFoundError: No module named 'core'
"""
from __future__ import annotations
import logging
from pathlib import Path

try:
    from fastapi import APIRouter, HTTPException
    from fastapi.responses import HTMLResponse, FileResponse
    _HAS_FASTAPI = True
except ImportError:
    _HAS_FASTAPI = False
    # Stubs so the module can be imported without fastapi installed
    class APIRouter:                      # type: ignore
        def get(self, *a, **k):   return lambda f: f
        def post(self, *a, **k):  return lambda f: f
    class HTTPException(Exception):      # type: ignore
        def __init__(self, status_code=500, detail=""):
            self.status_code = status_code; self.detail = detail
    class HTMLResponse:  pass            # type: ignore
    class FileResponse:  pass            # type: ignore

try:
    from reportforge.core.render.engines.enterprise_engine import render_preview
    _HAS_ENGINE = True
except ImportError:
    _HAS_ENGINE = False

logger        = logging.getLogger("reportforge.designer")
_DESIGNER_DIR = Path(__file__).parent
_INDEX_HTML   = _DESIGNER_DIR / "index.html"

router = APIRouter()


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_designer():
    """Serve the self-contained ReportForge Designer v3."""
    if not _INDEX_HTML.exists():
        raise HTTPException(404, "Designer not built")
    return HTMLResponse(
        content=_INDEX_HTML.read_text(encoding="utf-8"),
        headers={"Cache-Control": "no-cache"},
    )


@router.post("/preview", response_class=HTMLResponse, tags=["Designer"])
async def designer_preview(request: dict):
    """
    Render layout JSON → HTML preview for the visual designer.
    Body: { layout: {...rfd.json...}, data: {...}, params: {...} }
    """
    if not _HAS_ENGINE:
        raise HTTPException(503, "Render engine not available")

    layout_raw = request.get("layout")
    data       = request.get("data", {})
    params     = request.get("params", {})

    if not layout_raw or not isinstance(layout_raw, dict):
        raise HTTPException(422, "'layout' must be a JSON object")

    try:
        html = render_preview(layout_raw, data, params=params, preview=True)
        return HTMLResponse(content=html)
    except Exception as exc:
        logger.exception("Designer preview error")
        raise HTTPException(422, f"Preview error: {exc}") from exc


_MIME = {".js": "application/javascript", ".css": "text/css", ".html": "text/html"}

@router.get("/{path:path}", include_in_schema=False)
async def serve_static(path: str):
    """Serve legacy module JS/CSS files from the designer directory."""
    fp = (_DESIGNER_DIR / path).resolve()
    try:
        fp.relative_to(_DESIGNER_DIR.resolve())
    except ValueError:
        raise HTTPException(403, "Forbidden")
    if not fp.is_file():
        raise HTTPException(404, f"Not found: {path}")
    return FileResponse(fp, media_type=_MIME.get(fp.suffix, "application/octet-stream"))
