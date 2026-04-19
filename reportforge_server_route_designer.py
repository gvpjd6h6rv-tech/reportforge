from __future__ import annotations

from reportforge_server_designer import _minimal_designer_html
from reportforge_server_http_utils import _html
from reportforge_server_shared import _DESIGNER_HTML, _DESIGNER_HTML_V3


def _serve_designer(handler, force_mode=None):
    path = _DESIGNER_HTML if _DESIGNER_HTML.exists() else _DESIGNER_HTML_V3
    if path.exists():
        html = path.read_text(encoding="utf-8")
        if force_mode:
            html = html.replace('data-ui="classic"', f'data-ui="{force_mode}"', 1)
    else:
        html = _minimal_designer_html()
    _html(handler, html)
