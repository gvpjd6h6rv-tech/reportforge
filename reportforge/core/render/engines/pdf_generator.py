# core/render/engines/pdf_generator.py
# ─────────────────────────────────────────────────────────────────
# Generador PDF — envuelve WeasyPrint con manejo de errores limpio.
#
# WeasyPrint convierte el HTML A4 generado por HtmlEngine en un PDF
# listo para imprimir o enviar por email.
#
# Dependencia: pip install weasyprint
# ─────────────────────────────────────────────────────────────────

from __future__ import annotations
import sys
import tempfile
import io
from pathlib import Path
from typing import Optional


class PdfGeneratorError(Exception):
    """Error en la generación del PDF."""


class PdfGenerator:
    """
    Convierte HTML A4 → PDF via WeasyPrint.

    Uso:
        gen = PdfGenerator()
        pdf_bytes = gen.from_html(html_str)
        gen.save(pdf_bytes, "factura_020482.pdf")
    """

    def __init__(self, base_url: Optional[str] = None):
        """
        base_url: URL base para resolver recursos relativos.
        WeasyPrint se importa LAZY — solo al generar el PDF.
        Permite usar RenderEngine sin WeasyPrint instalado.
        """
        self._base_url   = base_url
        self._weasyprint = None  # lazy

    # ── Import ────────────────────────────────────────────────────
    @staticmethod
    def _import_weasyprint():
        try:
            import weasyprint
            return weasyprint
        except ImportError:
            raise PdfGeneratorError(
                "WeasyPrint no está instalado.\n"
                "Instala con: pip install weasyprint\n"
                "O en Linux Mint: sudo apt install python3-weasyprint"
            )

    # ── Generación ────────────────────────────────────────────────
    def from_html(self, html: str) -> bytes:
        """
        Convierte una cadena HTML a bytes PDF.

        Returns:
            bytes: Contenido del PDF listo para escribir a disco o enviar.

        Raises:
            PdfGeneratorError: Si WeasyPrint falla.
        """
        if self._weasyprint is None:
            self._weasyprint = self._import_weasyprint()
        try:
            wp = self._weasyprint
            doc = wp.HTML(
                string=html,
                base_url=self._base_url or ".",
            )
            return doc.write_pdf()
        except Exception as e:
            raise PdfGeneratorError(f"WeasyPrint error: {e}") from e

    def save(self, pdf_bytes: bytes, output_path: str | Path) -> Path:
        """
        Guarda los bytes PDF en disco.

        Returns:
            Path: Ruta del archivo creado.
        """
        p = Path(output_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(pdf_bytes)
        return p

    def from_html_to_file(self, html: str, output_path: str | Path) -> Path:
        """
        Shortcut: HTML → PDF en disco en un solo paso.
        """
        pdf_bytes = self.from_html(html)
        return self.save(pdf_bytes, output_path)

    # ── Verificación de disponibilidad ────────────────────────────
    @classmethod
    def is_available(cls) -> bool:
        """True si WeasyPrint está instalado y funcional."""
        try:
            import weasyprint
            return True
        except ImportError:
            return False

    @classmethod
    def version(cls) -> str:
        """Retorna la versión de WeasyPrint o 'not installed'."""
        try:
            import weasyprint
            return getattr(weasyprint, "__version__", "unknown")
        except ImportError:
            return "not installed"
