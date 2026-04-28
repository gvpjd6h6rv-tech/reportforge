"""
test_pdf_generator.py — PdfGenerator contract tests.

Tests are split into two classes:
  - TestPdfGeneratorAvailability: always runs, no WeasyPrint needed.
  - TestPdfGeneratorOutput: skipped unless WeasyPrint is installed.

This ensures CI without WeasyPrint still validates the API contract,
and CI with WeasyPrint validates end-to-end PDF byte output.

Coverage:
  1. is_available() returns bool (never crashes).
  2. version() returns string (never crashes).
  3. When unavailable: from_html() raises PdfGeneratorError naming WeasyPrint.
  4. When unavailable: error message is specific (not generic).
  5. When available: from_html() returns bytes starting with %PDF.
  6. When available: from_html_to_file() creates a readable .pdf file.
  7. When available: save() writes bytes to disk.
  8. Regression: same HTML always produces PDF bytes (deterministic enough to check header).
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from reportforge.core.render.engines.pdf_generator import PdfGenerator, PdfGeneratorError

_MINIMAL_HTML = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
@page { size: A4; margin: 10mm; }
body { font-family: Arial; font-size: 10pt; }
</style></head>
<body><p>Test ReportForge PDF</p></body>
</html>"""


class TestPdfGeneratorAvailability(unittest.TestCase):
    """Always runs — no WeasyPrint required."""

    def test_is_available_returns_bool(self):
        result = PdfGenerator.is_available()
        self.assertIsInstance(result, bool,
                              "is_available() must return bool, not crash")

    def test_version_returns_string(self):
        v = PdfGenerator.version()
        self.assertIsInstance(v, str,
                              "version() must return str, not crash")

    def test_version_not_empty(self):
        v = PdfGenerator.version()
        self.assertGreater(len(v), 0, "version() must not return empty string")

    def test_generator_instantiates_without_weasyprint(self):
        """PdfGenerator() must not import WeasyPrint at construction time."""
        gen = PdfGenerator()
        self.assertIsNotNone(gen)

    @unittest.skipIf(PdfGenerator.is_available(), "WeasyPrint IS installed")
    def test_from_html_raises_when_unavailable(self):
        """When WeasyPrint is absent, from_html() must raise PdfGeneratorError."""
        gen = PdfGenerator()
        with self.assertRaises(PdfGeneratorError) as ctx:
            gen.from_html(_MINIMAL_HTML)
        msg = str(ctx.exception).lower()
        self.assertIn("weasyprint", msg,
                      f"Error message must mention WeasyPrint. Got: {msg!r}")

    @unittest.skipIf(PdfGenerator.is_available(), "WeasyPrint IS installed")
    def test_unavailable_error_is_not_generic(self):
        """PdfGeneratorError must be specific, not 'error occurred'."""
        gen = PdfGenerator()
        with self.assertRaises(PdfGeneratorError) as ctx:
            gen.from_html(_MINIMAL_HTML)
        msg = str(ctx.exception)
        banned = ["invalid value", "error occurred", "something went wrong"]
        for phrase in banned:
            self.assertNotIn(phrase, msg.lower(),
                             f"Error message contains banned phrase {phrase!r}")

    @unittest.skipIf(PdfGenerator.is_available(), "WeasyPrint IS installed")
    def test_unavailable_error_suggests_install(self):
        """Error should hint at how to fix (pip install weasyprint)."""
        gen = PdfGenerator()
        with self.assertRaises(PdfGeneratorError) as ctx:
            gen.from_html(_MINIMAL_HTML)
        msg = str(ctx.exception).lower()
        self.assertTrue(
            "install" in msg or "pip" in msg or "apt" in msg,
            f"Error should suggest installation. Got: {msg!r}",
        )


@unittest.skipUnless(PdfGenerator.is_available(), "WeasyPrint not installed — skipping PDF output tests")
class TestPdfGeneratorOutput(unittest.TestCase):
    """Requires WeasyPrint installed. Validates PDF byte output."""

    def setUp(self):
        self.gen = PdfGenerator()

    def test_from_html_returns_bytes(self):
        result = self.gen.from_html(_MINIMAL_HTML)
        self.assertIsInstance(result, bytes,
                              "from_html() must return bytes")

    def test_from_html_returns_pdf_header(self):
        result = self.gen.from_html(_MINIMAL_HTML)
        self.assertTrue(result.startswith(b"%PDF"),
                        f"PDF bytes must start with %PDF. Got: {result[:8]!r}")

    def test_from_html_nonempty_output(self):
        result = self.gen.from_html(_MINIMAL_HTML)
        self.assertGreater(len(result), 100,
                           "PDF bytes must not be trivially small")

    def test_from_html_is_reproducible_header(self):
        """Same HTML must always produce bytes starting with %PDF."""
        b1 = self.gen.from_html(_MINIMAL_HTML)
        b2 = self.gen.from_html(_MINIMAL_HTML)
        self.assertTrue(b1.startswith(b"%PDF"))
        self.assertTrue(b2.startswith(b"%PDF"))

    def test_save_creates_file(self):
        pdf_bytes = self.gen.from_html(_MINIMAL_HTML)
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "test_output.pdf"
            result = self.gen.save(pdf_bytes, out)
            self.assertTrue(result.exists(), "save() must create the file")
            self.assertGreater(result.stat().st_size, 0, "PDF file must not be empty")

    def test_save_returns_path(self):
        pdf_bytes = self.gen.from_html(_MINIMAL_HTML)
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "out.pdf"
            result = self.gen.save(pdf_bytes, out)
            self.assertIsInstance(result, Path)

    def test_from_html_to_file_creates_pdf(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "roundtrip.pdf"
            result = self.gen.from_html_to_file(_MINIMAL_HTML, out)
            self.assertTrue(result.exists())
            content = result.read_bytes()
            self.assertTrue(content.startswith(b"%PDF"),
                            "from_html_to_file() must produce valid PDF")

    def test_from_html_with_unicode_content(self):
        """HTML with accented characters must produce valid PDF."""
        html = _MINIMAL_HTML.replace("Test ReportForge PDF",
                                     "Factura PRODUCCIÓN — ACME S.A. — Año 2024")
        result = self.gen.from_html(html)
        self.assertTrue(result.startswith(b"%PDF"))

    def test_render_engine_render_bytes_integration(self):
        """End-to-end: RenderEngine.render_bytes() returns valid PDF bytes."""
        from reportforge.core.render.render_engine import RenderEngine

        data = {
            "meta": {"doc_num": "001-001-000000001", "doc_type": "FACTURA",
                     "fecha_emision": "2024-01-15"},
            "empresa": {"razon_social": "ACME S.A.", "ruc": "0990123456001",
                        "direccion_matriz": "Av. Principal 123"},
            "cliente": {"razon_social": "Cliente Test", "identificacion": "0987654321",
                        "direccion": "Calle 1", "email": "test@test.com"},
            "fiscal": {"numero_documento": "001-001-000000001", "ambiente": "PRUEBAS",
                       "tipo_emision": "NORMAL", "fecha_autorizacion": "2024-01-15T10:00:00"},
            "items": [{"codigo": "A1", "descripcion": "Item", "cantidad": 1,
                       "precio_unitario": 10.0, "descuento": 0.0, "subtotal": 10.0}],
            "totales": {"subtotal": 10.0, "descuento": 0.0, "iva_12": 1.2, "total": 11.2},
        }
        engine = RenderEngine()
        pdf_bytes = engine.render_bytes(data)
        self.assertIsInstance(pdf_bytes, bytes)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
