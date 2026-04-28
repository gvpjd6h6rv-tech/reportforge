from __future__ import annotations

from pathlib import Path

from .docx_export import export_docx


def to_docx(exporter, output_path: str | Path) -> Path:
    return export_docx(exporter._layout_raw, exporter._data, output_path)


def to_rtf(exporter, output_path: str | Path) -> Path:
    from .rtf_export import export_rtf

    return export_rtf(exporter._layout_raw, exporter._data, output_path)
