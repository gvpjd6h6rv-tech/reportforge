from __future__ import annotations

from pathlib import Path

from .exporters_documents import to_docx, to_rtf
from .exporters_html import render_html, to_html
from .exporters_pdf import to_pdf, to_png
from .exporters_tabular import to_csv, to_xlsx


class Exporter:
    def __init__(self, layout_raw: dict, data: dict, debug: bool = False):
        self._layout_raw = layout_raw
        self._data = data
        self._debug = debug
        self._html: str | None = None

    def render_html(self) -> str:
        return render_html(self)

    def to_html(self, output_path: str | Path | None = None) -> str:
        return to_html(self, output_path)

    def to_pdf(self, output_path: str | Path) -> Path:
        return to_pdf(self, output_path)

    def to_png(self, output_path: str | Path, resolution: int = 150) -> Path:
        return to_png(self, output_path, resolution)

    def to_docx(self, output_path: str | Path) -> Path:
        return to_docx(self, output_path)

    def to_rtf(self, output_path: str | Path) -> Path:
        return to_rtf(self, output_path)

    def to_csv(self, output_path: str | Path | None = None, dataset: str = "items", encoding: str = "utf-8-sig", delimiter: str = ",") -> str:
        return to_csv(self, output_path, dataset, encoding, delimiter)

    def to_xlsx(self, output_path: str | Path, dataset: str = "items", sheet_name: str = "Report") -> Path:
        return to_xlsx(self, output_path, dataset, sheet_name)
