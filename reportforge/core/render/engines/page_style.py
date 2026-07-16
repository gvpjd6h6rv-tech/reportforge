# core/render/engines/page_style.py
# Converts canonical page geometry into preview dimensions and paged-media CSS.
from __future__ import annotations

from typing import Any

from ..pipeline.page_geometry import is_ticket_page, px_to_mm, standard_sheet_px


def preview_sheet_px(layout: dict[str, Any], page_width: int, page_height: int) -> tuple[int, int]:
    if is_ticket_page(layout):
        return page_width, page_height
    page_size = str(layout.get("pageSize") or "A4")
    orientation = str(layout.get("orientation") or "portrait")
    if page_size == "A4":
        return standard_sheet_px(page_size, orientation)
    return page_width, page_height


def build_page_rule(layout: dict[str, Any], margins: dict[str, float]) -> str:
    size_css = _page_size_css(layout)
    margin_css = (
        f"margin:{margins['top']}mm {margins['right']}mm "
        f"{margins['bottom']}mm {margins['left']}mm;"
    )
    footer_css = "" if is_ticket_page(layout) else (
        "@bottom-center{content:'Página 'counter(page)' de 'counter(pages);"
        "font-family:Arial,sans-serif;font-size:7pt;color:#888}"
    )
    return f"@page{{size:{size_css};{margin_css}{footer_css}}}"


def _page_size_css(layout: dict[str, Any]) -> str:
    if is_ticket_page(layout):
        width_mm = int(layout.get("ticketWidthMm") or 76)
        height_mm = px_to_mm(layout.get("pageHeight") or 1123)
        return f"{width_mm}mm {height_mm:g}mm"
    page_size = str(layout.get("pageSize") or "A4")
    orientation = str(layout.get("orientation") or "portrait")
    return f"{page_size} {orientation}"
