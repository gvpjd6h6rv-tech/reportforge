from __future__ import annotations

from reportforge_server_http_utils import _not_found, _respond
from reportforge_server_shared import _HERE


def _serve_favicon(handler):
    fav = _HERE / "favicon.ico"
    if fav.exists():
        handler.send_response(200)
        handler.send_header("Content-Type", "image/x-icon")
        handler.send_header("Cache-Control", "max-age=86400")
        handler.end_headers()
        handler.wfile.write(fav.read_bytes())
    else:
        _not_found(handler, "/favicon.ico")
