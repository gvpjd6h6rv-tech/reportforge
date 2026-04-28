from __future__ import annotations

from pathlib import Path

from ..engines.pdf_generator import PdfGenerator
from .exporters_html import render_html


def to_pdf(exporter, output_path: str | Path) -> Path:
    html = render_html(exporter)
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    PdfGenerator().from_html_to_file(html, p)
    return p


def to_png(exporter, output_path: str | Path, resolution: int = 150) -> Path:
    try:
        import weasyprint
    except ImportError:
        raise ImportError("PNG export requires WeasyPrint: pip install weasyprint")

    html = render_html(exporter)
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    doc = weasyprint.HTML(string=html)
    pages = doc.render()
    if not pages.pages:
        raise RuntimeError("No pages rendered")
    surface, _w, _h = pages.pages[0].paint(target=None, left_x=0, top_y=0, right_x=0, bottom_y=0)
    try:
        surface.write_to_png(str(p))
    except AttributeError:
        pages.write_png(str(p), resolution=resolution)
    return p
