from __future__ import annotations

from pathlib import Path
import os
import tempfile
import logging

from reportforge.core.render.export.exporters import Exporter
from reportforge.core.render.resolvers.layout_loader import _default_invoice_raw

from reportforge_server_http_utils import _error, _html, _respond
from reportforge_server_shared import _DEMO_DATA

logger = logging.getLogger("reportforge.api")


def _post_render(handler, body: dict):
    layout = body.get("layout") or _default_invoice_raw()
    data = body.get("data") or _DEMO_DATA
    fmt = (body.get("format") or "html").lower()
    try:
        exporter = Exporter(layout, data)
        if fmt == "html":
            logger.info("render layout=%s fmt=%s", layout.get("name") if isinstance(layout, dict) else "unknown", fmt)
            _html(handler, exporter.render_html())
        elif fmt == "pdf":
            logger.info("render layout=%s fmt=%s", layout.get("name") if isinstance(layout, dict) else "unknown", fmt)
            _temp_export(handler, exporter, ".pdf", exporter.to_pdf, "application/pdf")
        elif fmt == "csv":
            logger.info("render layout=%s fmt=%s", layout.get("name") if isinstance(layout, dict) else "unknown", fmt)
            _respond(handler, 200, exporter.to_csv().encode("utf-8-sig"), "text/csv")
        elif fmt == "xlsx":
            logger.info("render layout=%s fmt=%s", layout.get("name") if isinstance(layout, dict) else "unknown", fmt)
            _temp_export(handler, exporter, ".xlsx", exporter.to_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        elif fmt == "rtf":
            logger.info("render layout=%s fmt=%s", layout.get("name") if isinstance(layout, dict) else "unknown", fmt)
            _temp_export(handler, exporter, ".rtf", exporter.to_rtf, "application/rtf")
        elif fmt == "docx":
            logger.info("render layout=%s fmt=%s", layout.get("name") if isinstance(layout, dict) else "unknown", fmt)
            _temp_export(handler, exporter, ".docx", exporter.to_docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        else:
            _error(handler, 422, f"Unsupported format: {fmt}")
    except Exception as exc:
        _error(handler, 422, str(exc))


def _temp_export(handler, exporter, suffix, write_fn, ct):
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        p = f.name
    try:
        write_fn(p)
        payload = Path(p).read_bytes()
    finally:
        try:
            os.unlink(p)
        except Exception:
            pass
    _respond(handler, 200, payload, ct)
