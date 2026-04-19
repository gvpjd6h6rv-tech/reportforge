from __future__ import annotations

import urllib.parse

from reportforge_server_datasources import _post_ds_query, _post_register_ds
from reportforge_server_http_utils import _cors_headers, _not_found
from reportforge_server_route_barcode import _get_barcode, _post_barcode
from reportforge_server_route_designer import _serve_designer
from reportforge_server_route_favicon import _serve_favicon
from reportforge_server_route_health import _get_health
from reportforge_server_route_static import _serve_static
from reportforge_server_routes_preview import _post_preview
from reportforge_server_routes_render import _post_render
from reportforge_server_routes_validate import _post_validate_formula, _post_validate_layout


def handle_get(handler):
    path = _path(handler)
    if path == "/favicon.ico":
        return _serve_favicon(handler)
    if path in ("/", "/designer", "/classic"):
        return _serve_designer(handler)
    if path == "/modern":
        return _serve_designer(handler, force_mode="modern")
    if path == "/health":
        return _get_health(handler)
    if path.startswith("/preview-barcode"):
        return _get_barcode(handler)
    if path.startswith("/static/") or path.endswith((".js", ".css", ".svg", ".png")):
        return _serve_static(handler, path)
    _not_found(handler, path)


def handle_post(handler):
    path = _path(handler)
    body = _read_body(handler)
    if path in ("/preview", "/designer-preview"):
        return _post_preview(handler, body)
    if path == "/render":
        return _post_render(handler, body)
    if path in ("/preview-barcode", "/preview-barcode/body"):
        return _post_barcode(handler, body)
    if path in ("/validate", "/validate-layout"):
        return _post_validate_layout(handler, body)
    if path == "/validate-formula":
        return _post_validate_formula(handler, body)
    if path == "/datasources":
        return _post_register_ds(handler, body)
    if path.startswith("/datasources/") and path.endswith("/query"):
        alias = path.split("/")[2]
        return _post_ds_query(handler, alias, body)
    _not_found(handler, path)


def handle_options(handler):
    handler.send_response(200)
    _cors_headers(handler)
    handler.end_headers()


def _path(handler):
    return urllib.parse.urlparse(handler.path).path.rstrip("/") or "/"


def _read_body(handler) -> dict:
    import json

    try:
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length) if length else b"{}"
        return json.loads(raw) if raw.strip() else {}
    except Exception:
        return {}
