from __future__ import annotations

import urllib.parse

from reportforge.core.render.engines.advanced_engine import _render_barcode_svg

from reportforge_server_http_utils import _respond, _error


def _get_barcode(handler):
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query)
    value = qs.get("value", ["RF-DEMO"])[0]
    bc_type = qs.get("barcodeType", ["code128"])[0]
    width = int(qs.get("width", ["200"])[0])
    height = int(qs.get("height", ["80"])[0])
    show_text = qs.get("showText", ["true"])[0].lower() != "false"
    svg = _render_barcode_svg(value, bc_type, width, height, show_text)
    _respond(handler, 200, svg.encode(), "image/svg+xml")


def _post_barcode(handler, body: dict):
    value = str(body.get("value", "RF-001"))
    bc_type = str(body.get("barcodeType", "code128")).lower()
    width = int(body.get("width", 200))
    height = int(body.get("height", 80))
    show_text = bool(body.get("showText", True))
    svg = _render_barcode_svg(value, bc_type, width, height, show_text)
    _respond(handler, 200, svg.encode(), "image/svg+xml")
