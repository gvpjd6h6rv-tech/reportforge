from __future__ import annotations

import mimetypes

from reportforge_server_http_utils import _not_found, _respond
from reportforge_server_shared import _DESIGNER_SRC, _HERE

# Read-only mirror of tools/diagnostics/ so opt-in diagnostics (e.g. rf-bbox-ink)
# can be fetched by path without ever living in engines/ or the default HTML.
_DIAGNOSTICS_ROOT = (_HERE / "tools" / "diagnostics").resolve()


def _serve_static(handler, path: str):
    if path.startswith("/diagnostics/"):
        return _serve_diagnostic(handler, path[len("/diagnostics/"):])
    engines = _HERE / "engines"
    for base in [_DESIGNER_SRC, engines, _HERE]:
        fp = base / path.lstrip("/")
        if fp.exists() and fp.is_file():
            mt = mimetypes.guess_type(str(fp))[0] or "application/octet-stream"
            _respond(handler, 200, fp.read_bytes(), mt)
            return
    _not_found(handler, path)


def _serve_diagnostic(handler, rel_path: str):
    fp = (_DIAGNOSTICS_ROOT / rel_path.lstrip("/")).resolve()
    if fp.is_relative_to(_DIAGNOSTICS_ROOT) and fp.exists() and fp.is_file():
        mt = mimetypes.guess_type(str(fp))[0] or "application/octet-stream"
        _respond(handler, 200, fp.read_bytes(), mt)
        return
    _not_found(handler, "/diagnostics/" + rel_path)
