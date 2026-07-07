"""TEMPORARY diagnostic (#10.7T runtime-identity). NOT a fix. Remove after use.

Proves, from the live process, exactly which code is running/served so the
user can compare it against the files that were edited. Served at
GET /runtime-fingerprint (JSON) and surfaced by a "Runtime Fingerprint"
button in the designer.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from pathlib import Path

from reportforge_server_http_utils import _json
from reportforge_server_shared import _HERE, _DESIGNER_HTML, _DESIGNER_HTML_V3

_JS_OF_INTEREST = [
    "PropertiesEngine.js",
    "DocumentActions.js",
    "DocumentActionsLayoutClamp.js",
    "CanvasLayoutElements.js",
    "FieldExplorerEngine.js",
    # #10.15 preview overlay/selection owners — permanent, so /runtime-fingerprint
    # can verify the correct (cache-free) JS is served for the hover/selection
    # bbox fix. NOT the bbox-ink diagnostic: that is a tools/ opt-in, reported
    # separately (below) only when enabled, never a dependency here.
    "SelectionOverlayPreview.js",
    "SelectionOverlayRender.js",
    "PreviewHoverOutline.js",
    "PreviewOverlayStyle.js",
    # UDS 4.1 guide-extent/ruler-highlight owners — reported explicitly so a
    # cache/staleness dispute can be settled from the live process instead of
    # asserted: these are the files that own DESIGN's right/bottom guide
    # bound (panel-right/statusbar, not workspace) and the guide/highlight
    # gesture lifecycle, both corrected after live smoke contradicted an
    # earlier headless-only verification.
    "SelectionOverlay.js",
    "SelectionOverlayPreviewLayers.js",
]

# opt-in diagnostics reported only when present in engines/ (see enabled_diagnostics)
_DIAGNOSTIC_JS = ["RfBboxInkDiagnostic.js"]

_FIX_MARKERS = {
    "advanced_engine.py": "RF-PAGINATION-RF-HEIGHT-1",
    "DocumentActions.js": "clampSectionMovePatch",
    "PropertiesEngine.js": "RF-SECTION-MOVE-INK-1",
    "DocumentActionsLayoutClamp.js": "clampSectionMovePatch",
    "FieldExplorerEngine.js": "RF-SECTION-MOVE-INK-1",
    "SelectionOverlayPreview.js": "RF-PREVIEW-BBOX-INK-1",
    "SelectionOverlayRender.js": "RF-PREVIEW-SELECTION-RECT-1",
    "PreviewHoverOutline.js": "RF-PREVIEW-BBOX-INK-1",
    "PreviewOverlayStyle.js": "RF-PREVIEW-BBOX-HUG-1",
    # UDS 4.1: DESIGN's right/bottom guide bound reads #panel-right/#statusbar
    # directly (not #workspace) — this exact call is the marker, since it can
    # only be present if the panel-right/statusbar fix is the file on disk.
    "SelectionOverlayPreviewLayers.js": "getElementById('panel-right')",
    # UDS 4.1: paintRulerHighlight is only called inside `if (showGuides)` in
    # the corrected (gesture-gated, disappears on mouseup) version — an
    # earlier version called it unconditionally (persistent-while-selected).
    "SelectionOverlay.js": "if (showGuides) {",
}


def _finfo(path: Path) -> dict:
    try:
        b = path.read_bytes()
        marker = _FIX_MARKERS.get(path.name)
        return {
            "path": str(path),
            "exists": True,
            "size": len(b),
            "mtime": path.stat().st_mtime,
            "sha256_16": hashlib.sha256(b).hexdigest()[:16],
            "has_fix_marker": (marker in b.decode("utf-8", "replace")) if marker else None,
        }
    except Exception as exc:
        return {"path": str(path), "exists": False, "error": str(exc)}


def _git(*args) -> str:
    try:
        return subprocess.run(["git", "-C", str(_HERE), *args], capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception as exc:
        return f"(git error: {exc})"


def _get_fingerprint(handler):
    try:
        import reportforge.core.render.engines.advanced_engine as ae
        ae_file = ae.__file__
    except Exception as exc:
        ae_file = f"(import error: {exc})"

    pid = os.getpid()
    try:
        cmdline = Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").decode().strip()
    except Exception:
        cmdline = " ".join(sys.argv)

    served_html = _DESIGNER_HTML if _DESIGNER_HTML.exists() else _DESIGNER_HTML_V3
    try:
        server_file = str(Path(sys.modules["reportforge_server"].__file__))
    except Exception:
        server_file = "(n/a)"

    ae_block = {"imported___file__": ae_file}
    if isinstance(ae_file, str) and ae_file.endswith(".py"):
        ae_block.update(_finfo(Path(ae_file)))

    _json(handler, {
        "diagnostic": "#10.7T runtime-identity (TEMPORARY)",
        "process": {
            "pid": pid,
            "cwd": os.getcwd(),
            "cmdline": cmdline,
            "python": sys.executable,
            "sys_path_head": sys.path[:6],
        },
        "server_file": server_file,
        "git": {
            "HEAD": _git("rev-parse", "HEAD"),
            "HEAD_subject": _git("log", "-1", "--format=%s"),
            "status_short": _git("status", "--short"),
            "branch": _git("rev-parse", "--abbrev-ref", "HEAD"),
        },
        "advanced_engine": ae_block,
        "served_html": _finfo(served_html),
        "served_js": {name: _finfo(_HERE / "engines" / name) for name in _JS_OF_INTEREST},
        # opt-in diagnostics: reported only when copied into engines/ (enabled via
        # tools/diagnostics/*/enable.sh). Soft — the fingerprint never depends on them.
        "enabled_diagnostics": {
            name: _finfo(_HERE / "engines" / name)
            for name in _DIAGNOSTIC_JS
            if (_HERE / "engines" / name).exists()
        },
        "root": str(_HERE),
    })
