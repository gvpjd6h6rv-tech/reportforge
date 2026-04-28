from __future__ import annotations

from pathlib import Path
from typing import Optional

from .engines.html_engine import HtmlEngine
from .engines.pdf_generator import PdfGenerator
from .render_engine_validation import RenderEngineError, validate_render_data
from .resolvers.field_resolver import FieldResolver
from .resolvers.layout_loader import default_invoice_layout, layout_from_dict, load_layout


class RenderEngine:
    """
    Motor de render WYSIWYG.
    """

    def __init__(
        self,
        layout_path: Optional[str | Path] = None,
        output_dir: str | Path = "output",
        debug: bool = False,
    ):
        self._output_dir = Path(output_dir)
        self._debug = debug
        self._pdf = PdfGenerator()
        self._layout_path = layout_path
        self._layout = load_layout(layout_path) if layout_path else default_invoice_layout()

    def render_invoice(self, doc_entry: int, output_filename: Optional[str] = None) -> Path:
        data = self._call_builder(doc_entry)
        fname = output_filename or f"factura_{str(doc_entry).zfill(6)}.pdf"
        return self._generate_pdf(data, fname)

    def render_from_dict(self, data: dict, output_filename: Optional[str] = None) -> Path:
        validate_render_data(data)
        doc_num = data.get("meta", {}).get("doc_num", "000000")
        fname = output_filename or f"factura_{str(doc_num).zfill(6)}.pdf"
        return self._generate_pdf(data, fname)

    def render_html(self, data: dict) -> str:
        validate_render_data(data)
        return self._build_html(data)

    def render_bytes(self, data: dict) -> bytes:
        validate_render_data(data)
        html = self._build_html(data)
        return self._pdf.from_html(html)

    def with_layout(self, layout_path: str | Path) -> "RenderEngine":
        return RenderEngine(layout_path=layout_path, output_dir=self._output_dir, debug=self._debug)

    def with_layout_dict(self, raw: dict) -> "RenderEngine":
        clone = RenderEngine(output_dir=self._output_dir, debug=self._debug)
        clone._layout = layout_from_dict(raw)
        return clone

    def info(self) -> dict:
        return {
            "layout_name": self._layout.name,
            "layout_path": str(self._layout_path) if self._layout_path else "(default)",
            "output_dir": str(self._output_dir),
            "page_width": self._layout.page_width,
            "sections": [
                {
                    "id": s.id,
                    "stype": s.stype,
                    "height": s.height,
                    "iterable": s.is_iterable,
                    "elements": len(self._layout.elements_for(s.id)),
                }
                for s in self._layout.sections
            ],
            "total_elements": len(self._layout.elements),
            "weasyprint": self._pdf.version(),
            "debug": self._debug,
        }

    def _build_html(self, data: dict) -> str:
        resolver = FieldResolver(data)
        engine = HtmlEngine(self._layout, resolver, debug=self._debug)
        return engine.render()

    def _generate_pdf(self, data: dict, filename: str) -> Path:
        html = self._build_html(data)
        self._output_dir.mkdir(parents=True, exist_ok=True)
        out = self._output_dir / filename
        self._pdf.from_html_to_file(html, out)
        return out

    def _call_builder(self, doc_entry: int) -> dict:
        try:
            from core.models.invoice_model import build_invoice_model
        except ImportError as e:
            raise RenderEngineError(
                f"No se pudo importar build_invoice_model: {e}"
            ) from e
        try:
            data = build_invoice_model(doc_entry)
        except NotImplementedError:
            raise RenderEngineError(
                "build_invoice_model no está implementado. "
                "Implementa core/models/invoice_model.py y úsalo "
                "con render_from_dict(data) si ya tienes el dict."
            )
        return data
