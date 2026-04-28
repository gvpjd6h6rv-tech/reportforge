from __future__ import annotations

from pathlib import Path
from typing import Optional

from .render_engine_runtime import RenderEngine


def generate_invoice_pdf(
    doc_entry: int,
    layout_path: Optional[str | Path] = None,
    output_dir: str | Path = "output",
) -> Path:
    return RenderEngine(layout_path=layout_path, output_dir=output_dir).render_invoice(doc_entry)


def preview_invoice_html(
    data: dict,
    layout_path: Optional[str | Path] = None,
) -> str:
    return RenderEngine(layout_path=layout_path).render_html(data)


def render_from_layout_file(
    data: dict,
    layout_path: str | Path,
    output_dir: str | Path = "output",
    filename: Optional[str] = None,
) -> Path:
    return RenderEngine(
        layout_path=layout_path,
        output_dir=output_dir,
    ).render_from_dict(data, filename)
