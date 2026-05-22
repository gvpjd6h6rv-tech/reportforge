from __future__ import annotations

import json
import logging

from reportforge_server_http_utils import _json

logger = logging.getLogger("reportforge.audit")


def _post_audit(handler, body: dict):
    payload = body if isinstance(body, dict) else {}
    action = str(payload.get("action") or payload.get("event") or "unknown")
    owner = str(payload.get("owner") or payload.get("subsystem") or "unknown")
    element_id = payload.get("elementId")
    result = payload.get("result")
    logger.info("audit action=%s owner=%s element=%s result=%s", action, owner, element_id, result)
    print(f"[RF_AUDIT] {json.dumps(payload, ensure_ascii=False, default=str)}")
    _json(handler, {"ok": True})

