from __future__ import annotations

import mimetypes

from reportforge_server_http_utils import _not_found, _respond
from reportforge_server_shared import _DESIGNER_SRC, _HERE


def _serve_static(handler, path: str):
    engines = _HERE / "engines"
    for base in [_DESIGNER_SRC, engines, _HERE]:
        fp = base / path.lstrip("/")
        if fp.exists() and fp.is_file():
            mt = mimetypes.guess_type(str(fp))[0] or "application/octet-stream"
            _respond(handler, 200, fp.read_bytes(), mt)
            return
    _not_found(handler, path)
