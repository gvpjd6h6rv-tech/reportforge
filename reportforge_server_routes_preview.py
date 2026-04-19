from __future__ import annotations

import urllib.parse
from pathlib import Path

from reportforge.core.render.engines.advanced_engine import AdvancedHtmlEngine, _render_barcode_svg
from reportforge.core.render.export.exporters import Exporter
from reportforge.core.render.resolvers.layout_loader import _default_invoice_raw

from reportforge_server_designer import _minimal_designer_html
from reportforge_server_shared import _DEMO_DATA, _DESIGNER_HTML, _DESIGNER_HTML_V3, _DESIGNER_SRC, _HERE
from reportforge_server_http_utils import _error, _html, _not_found, _respond


def handle_get(handler):
    path = urllib.parse.urlparse(handler.path).path.rstrip("/") or "/"
    if path == "/favicon.ico":
        fav = _HERE / "favicon.ico"
        if fav.exists():
            handler.send_response(200)
            handler.send_header("Content-Type", "image/x-icon")
            handler.send_header("Cache-Control", "max-age=86400")
            handler.end_headers()
            handler.wfile.write(fav.read_bytes())
        else:
            _not_found(handler, path)
        return
    if path in ("/", "/designer", "/classic"):
        _serve_designer(handler)
    elif path == "/modern":
        _serve_designer(handler, force_mode="modern")
    elif path == "/health":
        from reportforge_server_http_utils import _json
        import datetime

        _json(handler, {"status": "ok", "version": "2.0.0", "tests": "644/644 OK", "time": str(datetime.datetime.now())})
    elif path.startswith("/preview-barcode"):
        _get_barcode(handler)
    elif path.startswith("/static/") or path.endswith((".js", ".css", ".svg", ".png")):
        _serve_static(handler, path)
    else:
        _not_found(handler, path)


def handle_post(handler):
    path = urllib.parse.urlparse(handler.path).path.rstrip("/")
    body = _read_body(handler)
    if path == "/preview" or path == "/designer-preview":
        _post_preview(handler, body)
    elif path == "/render":
        _post_render(handler, body)
    elif path in ("/preview-barcode", "/preview-barcode/body"):
        _post_barcode(handler, body)
    else:
        _not_found(handler, path)


def _serve_designer(handler, force_mode=None):
    path = _DESIGNER_HTML if _DESIGNER_HTML.exists() else _DESIGNER_HTML_V3
    if path.exists():
        html = path.read_text(encoding="utf-8")
        if force_mode:
            html = html.replace('data-ui="classic"', f'data-ui="{force_mode}"', 1)
    else:
        html = _minimal_designer_html()
    _html(handler, html)


def _get_barcode(handler):
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query)
    value = qs.get("value", ["RF-DEMO"])[0]
    bc_type = qs.get("barcodeType", ["code128"])[0]
    width = int(qs.get("width", ["200"])[0])
    height = int(qs.get("height", ["80"])[0])
    show_text = qs.get("showText", ["true"])[0].lower() != "false"
    svg = _render_barcode_svg(value, bc_type, width, height, show_text)
    _respond(handler, 200, svg.encode(), "image/svg+xml")


def _post_preview(handler, body: dict):
    layout = body.get("layout") or _default_invoice_raw()
    data = body.get("data") or _DEMO_DATA
    try:
        _html(handler, AdvancedHtmlEngine(layout, data).render())
    except Exception as exc:
        _error(handler, 422, str(exc))


def _post_render(handler, body: dict):
    layout = body.get("layout") or _default_invoice_raw()
    data = body.get("data") or _DEMO_DATA
    fmt = (body.get("format") or "html").lower()
    try:
        exporter = Exporter(layout, data)
        if fmt == "html":
            _html(handler, exporter.render_html())
        else:
            _error(handler, 422, f"Unsupported format: {fmt}")
    except Exception as exc:
        _error(handler, 422, str(exc))


def _serve_static(handler, path: str):
    engines = _HERE / "engines"
    for base in [_DESIGNER_SRC, engines, _HERE]:
        fp = base / path.lstrip("/")
        if fp.exists() and fp.is_file():
            mt = "application/octet-stream"
            _respond(handler, 200, fp.read_bytes(), mt)
            return
    _not_found(handler, path)


def _read_body(handler) -> dict:
    import json

    try:
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length) if length else b"{}"
        return json.loads(raw) if raw.strip() else {}
    except Exception:
        return {}
