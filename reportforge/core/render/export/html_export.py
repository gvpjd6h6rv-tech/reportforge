# export/html_export.py — standalone HTML export
from pathlib import Path

def export_html(html: str, output: str | Path) -> Path:
    """Write HTML to file, return path."""
    p = Path(output)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(html, encoding="utf-8")
    return p
