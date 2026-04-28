from __future__ import annotations

from pathlib import Path


def render_html(exporter) -> str:
    if exporter._html is None:
        from ..engines.advanced_engine import AdvancedHtmlEngine
        exporter._html = AdvancedHtmlEngine(
            exporter._layout_raw, exporter._data, debug=exporter._debug
        ).render()
    return exporter._html


def to_html(exporter, output_path: str | Path | None = None) -> str:
    html = render_html(exporter)
    if output_path:
        Path(output_path).write_text(html, encoding="utf-8")
    return html
