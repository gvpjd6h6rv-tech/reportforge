from __future__ import annotations

from pathlib import Path

from .exporters_runtime import Exporter


def export(layout_raw: dict, data: dict, output_path: str | Path, fmt: str | None = None, **kwargs) -> Path | str:
    p = Path(output_path)
    if fmt is None:
        fmt = p.suffix.lstrip(".").lower() or "html"

    ex = Exporter(layout_raw, data, **{k: v for k, v in kwargs.items() if k in ("debug",)})
    if fmt == "html":
        return ex.to_html(p)
    if fmt == "pdf":
        return ex.to_pdf(p)
    if fmt == "png":
        return ex.to_png(p)
    if fmt == "csv":
        return ex.to_csv(p)
    if fmt == "xlsx":
        return ex.to_xlsx(p)
    if fmt == "docx":
        return ex.to_docx(p)
    if fmt == "rtf":
        return ex.to_rtf(p)
    raise ValueError(f"Unsupported export format: {fmt!r}")
