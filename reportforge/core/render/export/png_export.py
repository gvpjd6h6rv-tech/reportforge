# export/png_export.py — PNG export via WeasyPrint or html2image
from __future__ import annotations
from pathlib import Path


def export_png(html: str, output: str | Path,
               width: int = 794, dpi: int = 96) -> Path:
    """
    Render HTML report to PNG image.
    Uses WeasyPrint for high-quality output.
    Falls back to a simple placeholder if unavailable.
    """
    p = Path(output)
    p.parent.mkdir(parents=True, exist_ok=True)

    try:
        from weasyprint import HTML as WP_HTML
        doc = WP_HTML(string=html)
        # WeasyPrint can write PNG via Pillow
        surface = doc.write_png(resolution=dpi)
        p.write_bytes(surface)
        return p
    except (ImportError, AttributeError):
        pass

    # Fallback: use matplotlib to render text placeholder
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(width / 96, 11.7))
        ax.text(0.5, 0.5, "ReportForge Report\n(Install WeasyPrint for full rendering)",
                ha="center", va="center", fontsize=12, transform=ax.transAxes)
        ax.axis("off")
        fig.savefig(str(p), dpi=dpi, bbox_inches="tight")
        plt.close(fig)
        return p
    except ImportError:
        raise RuntimeError("PNG export requires WeasyPrint or matplotlib")
