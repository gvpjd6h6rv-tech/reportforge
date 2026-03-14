# core/render/__init__.py
# Exporta la API pública del RenderEngine.

from .render_engine import (
    RenderEngine,
    RenderEngineError,
    generate_invoice_pdf,
    preview_invoice_html,
)

__all__ = [
    "RenderEngine",
    "RenderEngineError",
    "generate_invoice_pdf",
    "preview_invoice_html",
]
