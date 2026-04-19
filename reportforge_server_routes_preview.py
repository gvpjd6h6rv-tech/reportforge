from __future__ import annotations

from reportforge.core.render.engines.advanced_engine import AdvancedHtmlEngine
from reportforge.core.render.resolvers.layout_loader import _default_invoice_raw

from reportforge_server_http_utils import _error, _html
from reportforge_server_shared import _DEMO_DATA


def _post_preview(handler, body: dict):
    layout = body.get("layout") or _default_invoice_raw()
    data = body.get("data") or _DEMO_DATA
    try:
        _html(handler, AdvancedHtmlEngine(layout, data).render())
    except Exception as exc:
        _error(handler, 422, str(exc))
