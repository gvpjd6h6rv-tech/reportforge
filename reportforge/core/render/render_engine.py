# core/render/render_engine.py
# ─────────────────────────────────────────────────────────────────
# RenderEngine — fachada pública del pipeline WYSIWYG
#
# Pipeline:
#   build_invoice_model(doc_entry)
#       → dict canónico
#       → FieldResolver
#       → Layout (.rfd.json del Designer, o layout por defecto)
#       → HtmlEngine.render() → HTML A4
#       → PdfGenerator        → bytes PDF
#       → archivo .pdf
# ─────────────────────────────────────────────────────────────────

from __future__ import annotations
import json
from pathlib import Path
from typing import Optional

from .resolvers.field_resolver import FieldResolver
from .resolvers.layout_loader  import (
    load_layout, layout_from_dict, default_invoice_layout, Layout,
)
from .engines.html_engine      import HtmlEngine
from .engines.pdf_generator    import PdfGenerator, PdfGeneratorError


class RenderEngineError(Exception):
    pass


class RenderEngine:
    """
    Motor de render WYSIWYG.

    Uso mínimo (3 líneas):
        engine = RenderEngine()
        pdf    = engine.render_invoice(doc_entry=20482)
        # → output/factura_20482.pdf

    Con layout del Designer:
        engine = RenderEngine(layout_path="layouts/factura.rfd.json")

    Con dict en memoria (builder ya invocado):
        data = build_invoice_model(20482)
        pdf  = engine.render_from_dict(data)

    Solo HTML (preview sin WeasyPrint):
        html = engine.render_html(data)
    """

    REQUIRED_KEYS = {"meta", "empresa", "cliente", "fiscal", "items", "totales"}

    def __init__(
        self,
        layout_path: Optional[str | Path] = None,
        output_dir:  str | Path = "output",
        debug:       bool = False,
    ):
        self._output_dir  = Path(output_dir)
        self._debug       = debug
        self._pdf         = PdfGenerator()
        self._layout_path = layout_path

        # Load layout — from file if given, else default
        if layout_path:
            self._layout = load_layout(layout_path)
        else:
            self._layout = default_invoice_layout()

    # ── Main entry points ─────────────────────────────────────────

    def render_invoice(
        self,
        doc_entry: int,
        output_filename: Optional[str] = None,
    ) -> Path:
        """
        Genera PDF a partir de doc_entry (llama a build_invoice_model).
        Requiere que core/models/invoice_model.py esté implementado.
        """
        data = self._call_builder(doc_entry)
        fname = output_filename or f"factura_{str(doc_entry).zfill(6)}.pdf"
        return self._generate_pdf(data, fname)

    def render_from_dict(
        self,
        data: dict,
        output_filename: Optional[str] = None,
    ) -> Path:
        """
        Genera PDF a partir del dict canónico (builder ya invocado).
        """
        self._validate(data)
        doc_num = data.get("meta", {}).get("doc_num", "000000")
        fname   = output_filename or f"factura_{str(doc_num).zfill(6)}.pdf"
        return self._generate_pdf(data, fname)

    def render_html(self, data: dict) -> str:
        """
        Devuelve solo el HTML (para preview/debug, sin generar PDF).
        No requiere WeasyPrint.
        """
        self._validate(data)
        html = self._build_html(data)
        self._assert_items_unchanged(data)
        return html

    def render_bytes(self, data: dict) -> bytes:
        """
        Devuelve el PDF como bytes en memoria (para email/HTTP).
        """
        self._validate(data)
        html = self._build_html(data)
        self._assert_items_unchanged(data)
        return self._pdf.from_html(html)

    def with_layout(self, layout_path: str | Path) -> "RenderEngine":
        """
        Devuelve un nuevo engine con el layout especificado.
        Útil para multi-reporte sin reinstanciar.
        """
        return RenderEngine(
            layout_path=layout_path,
            output_dir=self._output_dir,
            debug=self._debug,
        )

    def with_layout_dict(self, raw: dict) -> "RenderEngine":
        """Aplica un layout desde dict (útil en tests)."""
        clone = RenderEngine(output_dir=self._output_dir, debug=self._debug)
        clone._layout = layout_from_dict(raw)
        return clone

    # ── Info ──────────────────────────────────────────────────────

    def info(self) -> dict:
        return {
            "layout_name":  self._layout.name,
            "layout_path":  str(self._layout_path) if self._layout_path else "(default)",
            "output_dir":   str(self._output_dir),
            "page_width":   self._layout.page_width,
            "sections":     [
                {"id": s.id, "stype": s.stype, "height": s.height,
                 "iterable": s.is_iterable, "elements": len(self._layout.elements_for(s.id))}
                for s in self._layout.sections
            ],
            "total_elements": len(self._layout.elements),
            "weasyprint":   self._pdf.version(),
            "debug":        self._debug,
        }

    # ── Internal ──────────────────────────────────────────────────

    def _build_html(self, data: dict) -> str:
        resolver = FieldResolver(data, debug=self._debug)
        engine   = HtmlEngine(self._layout, resolver, debug=self._debug)
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

    def _validate(self, data: dict) -> None:
        if not isinstance(data, dict):
            raise RenderEngineError("data debe ser un dict")
        missing = self.REQUIRED_KEYS - set(data.keys())
        if missing:
            raise RenderEngineError(f"Faltan claves en data: {missing}")
        if not isinstance(data.get("items"), list):
            raise RenderEngineError("data['items'] debe ser una lista")
        if self._debug:
            # Snapshot item dicts so we can detect mutations after render
            self._items_snapshot = {
                i: hash(frozenset(
                    (k, str(v)) for k, v in item.items()
                    if isinstance(v, (str, int, float, bool, type(None)))
                ))
                for i, item in enumerate(data.get("items", []))
                if isinstance(item, dict)
            }

    def _assert_items_unchanged(self, data: dict) -> None:
        """In debug mode: raise if any item dict was mutated during render."""
        if not self._debug or not hasattr(self, "_items_snapshot"):
            return
        for i, item in enumerate(data.get("items", [])):
            if not isinstance(item, dict):
                continue
            current_hash = hash(frozenset(
                (k, str(v)) for k, v in item.items()
                if isinstance(v, (str, int, float, bool, type(None)))
            ))
            if self._items_snapshot.get(i) != current_hash:
                raise RenderEngineError(
                    f"data['items'][{i}] fue mutado durante el render. "
                    f"Los renderers no deben modificar el dict de entrada."
                )


# ── Convenience functions ─────────────────────────────────────────

def generate_invoice_pdf(
    doc_entry:   int,
    layout_path: Optional[str | Path] = None,
    output_dir:  str | Path = "output",
) -> Path:
    """Una línea: genera PDF desde doc_entry."""
    return RenderEngine(layout_path=layout_path, output_dir=output_dir).render_invoice(doc_entry)


def preview_invoice_html(
    data:        dict,
    layout_path: Optional[str | Path] = None,
) -> str:
    """Una línea: genera HTML para preview."""
    return RenderEngine(layout_path=layout_path).render_html(data)


def render_from_layout_file(
    data:        dict,
    layout_path: str | Path,
    output_dir:  str | Path = "output",
    filename:    Optional[str] = None,
) -> Path:
    """
    Usa directamente un .rfd.json del Designer para generar el PDF.

    Uso:
        pdf = render_from_layout_file(data, "layouts/factura.rfd.json")
    """
    return RenderEngine(
        layout_path=layout_path,
        output_dir=output_dir,
    ).render_from_dict(data, filename)
