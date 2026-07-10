#!/usr/bin/env python3
"""render_margin_cases.py — PAGE-MARGIN-MODEL-01 diagnostic, render step.

Single responsibility: render AdvancedHtmlEngine.render_preview() for the 5
required margin cases (A-E) with visible debug ink injected, and write each
to an HTML file. Does NOT measure, screenshot, or judge PASS/FAIL — that is
rf_page_margin_ink_probe.mjs's job, against the REAL rendered DOM (not this
script's own output text).

Usage: python3 render_margin_cases.py <output_dir>
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "reportforge"))

from core.render.engines.advanced_engine import AdvancedHtmlEngine  # noqa: E402

_PAGE_WIDTH = 671
_DEF = {"top": 15, "right": 20, "bottom": 15, "left": 20}

CASES = {
    "A_left0_right0": {**_DEF, "left": 0, "right": 0},
    "B_left100_right0": {**_DEF, "left": 100, "right": 0},
    "C_left0_right100": {**_DEF, "left": 0, "right": 100},
    "D_left100_right100": {**_DEF, "left": 100, "right": 100},
    "E_left176_right0": {**_DEF, "left": 176, "right": 0},  # exact user-reported case
}

_DEBUG_INK = (
    "<style>"
    ".rpt-sheet{outline:4px solid #0057FF !important;}"      # hoja fisica = azul
    ".rpt-page{outline:4px dashed #FF0000 !important;}"       # area imprimible = rojo
    ".cr-el{background:rgba(0,200,0,.35) !important;outline:2px solid #00A000 !important;}"  # tinta de contenido = verde
    "body{background:#ddd;}"
    ".ink-label{position:fixed;top:0;left:0;background:#000;color:#fff;"
    "font:12px monospace;padding:4px 8px;z-index:9999;white-space:pre;}"
    "</style>"
)


def _layout(margins: dict) -> dict:
    return {
        "name": "PAGE-MARGIN-MODEL-01-diagnostic",
        "pageWidth": _PAGE_WIDTH,
        "pageSize": "A4",
        "margins": margins,
        "sections": [
            {"id": "s-rh", "stype": "rh", "height": 120},
            {"id": "s-det", "stype": "det", "height": 16, "iterates": "items"},
        ],
        "elements": [
            {"id": "e1", "type": "text", "sectionId": "s-rh", "x": 0, "y": 4,
             "w": 660, "h": 14, "content": "INK LEFT EDGE (x=0)"},
            {"id": "e2", "type": "text", "sectionId": "s-rh", "x": 480, "y": 30,
             "w": 180, "h": 14, "content": "INK NEAR RIGHT EDGE"},
        ],
    }


_DATA = {"items": [{"c": 1}]}


def render_case(name: str, margins: dict) -> str:
    """Render one case's preview HTML with debug ink injected. Pure — no I/O."""
    html = AdvancedHtmlEngine(_layout(margins), _DATA).render_preview()
    label = (
        f'<div class="ink-label">{name}  left={margins["left"]}mm right={margins["right"]}mm</div>'
    )
    html = html.replace("</head>", _DEBUG_INK + "</head>")
    html = html.replace("<body>", "<body>" + label)
    return html


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: render_margin_cases.py <output_dir>", file=sys.stderr)
        sys.exit(1)
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, margins in CASES.items():
        html = render_case(name, margins)
        (out_dir / f"case_{name}.html").write_text(html, encoding="utf-8")
        print(f"wrote case_{name}.html")


if __name__ == "__main__":
    main()
