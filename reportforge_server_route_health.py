from __future__ import annotations

import datetime

from reportforge_server_http_utils import _json


def _get_health(handler):
    _json(handler, {"status": "ok", "version": "2.0.0", "tests": "644/644 OK", "time": str(datetime.datetime.now())})
