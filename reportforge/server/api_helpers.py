from __future__ import annotations

import io
import json
import logging
from pathlib import Path
from typing import Any

from reportforge.core.render.datasource import DataSource
from reportforge.server.cache import LayoutCache
from .api_contracts import HTMLResponse, JSONResponse, Response, HTTPException

logger = logging.getLogger("reportforge.api")


def load_data(payload: Any, *, allow_dict_spec: bool = False) -> dict:
    if isinstance(payload, str) and payload:
        return DataSource.load(payload)
    if allow_dict_spec and isinstance(payload, dict) and payload:
        return DataSource.load(payload)
    return payload or {}


def _resolve_layout(layout_spec: Any, tenant: str, cache: LayoutCache) -> dict:
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
    fmt = (fmt or "pdf").lower()
    if fmt == "html":
        return HTMLResponse(content=html)
    if fmt == "pdf":
        try:
            from reportforge.core.render.engines.pdf_generator import PdfGenerator
            pdf_bytes = PdfGenerator().from_html_to_bytes(html)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": 'attachment; filename="report.pdf"'},
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
        return Response(content=csv_bytes, media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="report.csv"'})
    if fmt == "xlsx":
        from reportforge.core.render.export.xlsx_export import export_xlsx
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            export_xlsx(data, tmp.name)
            xlsx_bytes = Path(tmp.name).read_bytes()
        return Response(content=xlsx_bytes, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": 'attachment; filename="report.xlsx"'})
    if fmt == "png":
        from reportforge.core.render.export.png_export import export_png
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            export_png(html, tmp.name)
            png_bytes = Path(tmp.name).read_bytes()
        return Response(content=png_bytes, media_type="image/png", headers={"Content-Disposition": 'attachment; filename="report.png"'})
    if fmt == "docx":
        return JSONResponse(status_code=422, content={"detail": "DOCX export: call POST /render with format=docx and include layout+data"})
    if fmt == "rtf":
        return JSONResponse(status_code=422, content={"detail": "RTF export: call POST /render with format=rtf and include layout+data"})
    return HTMLResponse(content=html)


def _validate(layout: dict) -> list[dict]:
    warnings = []
    w = lambda level, msg: warnings.append({"level": level, "message": msg})
    if not layout.get("sections"):
        w("error", "Layout has no sections defined")
    if not layout.get("elements"):
        w("warning", "Layout has no elements — report will be blank")
    if not layout.get("name"):
        w("info", "Layout has no name — consider adding one")
    section_ids = {s.get("id") for s in layout.get("sections", [])}
    for el in layout.get("elements", []):
        if el.get("sectionId") not in section_ids:
            w("error", f"Element '{el.get('id','')}' references non-existent sectionId '{el.get('sectionId')}'")
        if el.get("type") == "field" and not el.get("fieldPath"):
            w("warning", f"Field element '{el.get('id','')}' has no fieldPath — will render empty")
        if el.get("w", 0) <= 0 or el.get("h", 0) <= 0:
            w("error", f"Element '{el.get('id','')}' has zero or negative dimensions")
    pw = layout.get("pageWidth", 794)
    for el in layout.get("elements", []):
        if el.get("x", 0) + el.get("w", 0) > pw:
            w("warning", f"Element '{el.get('id','')}' overflows page width ({pw}px)")
    return warnings
