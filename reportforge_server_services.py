from __future__ import annotations

from reportforge_server_datasources import _post_ds_query, _post_register_ds
from reportforge_server_http_utils import _cors_headers, _not_found
from reportforge_server_routes_preview import _get_barcode, _post_preview, _serve_designer, _serve_static, _read_body
from reportforge_server_routes_render import _post_render
from reportforge_server_routes_validate import _post_validate_formula, _post_validate_layout


def handle_get(handler):
    path = _path(handler)
    if path == "/favicon.ico":
        from reportforge_server_routes_preview import handle_get as _handle_get_preview

        return _handle_get_preview(handler)
    if path in ("/", "/designer", "/classic", "/modern", "/health") or path.startswith("/preview-barcode") or path.startswith("/static/") or path.endswith((".js", ".css", ".svg", ".png")):
        from reportforge_server_routes_preview import handle_get as _handle_get_preview

        return _handle_get_preview(handler)
    _not_found(handler, path)


def handle_post(handler):
    path = _path(handler)
    body = _read_body(handler)
    if path in ("/preview", "/designer-preview", "/preview-barcode", "/preview-barcode/body"):
        from reportforge_server_routes_preview import handle_post as _handle_post_preview

        return _handle_post_preview(handler)
    if path == "/render":
        return _post_render(handler, body)
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
    import urllib.parse

    return urllib.parse.urlparse(handler.path).path.rstrip("/") or "/"
