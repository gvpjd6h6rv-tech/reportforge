# core/render/engines/page_style.py
# Converts canonical page geometry into preview dimensions and paged-media CSS.
from __future__ import annotations

from typing import Any

from ..pipeline.page_geometry import is_ticket_page, px_to_mm, standard_sheet_px

MM_TO_PX = 3.7795


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


def build_preview_chrome(
    layout: dict[str, Any],
    margins: dict[str, float],
    page_width: int,
    page_height: int,
    printable_width: int,
) -> str:
    sheet_width, sheet_height = preview_sheet_px(layout, page_width, page_height)
    left_px, right_px = _clamp_pair(
        round(margins["left"] * MM_TO_PX),
        round(margins["right"] * MM_TO_PX),
        sheet_width,
    )
    top_px, bottom_px = _clamp_pair(
        round(margins["top"] * MM_TO_PX),
        round(margins["bottom"] * MM_TO_PX),
        sheet_height,
    )
    page_content_height = max(0, page_height - top_px - bottom_px)
    return (
        ".rpt-sheet{box-sizing:border-box;background:#fff;"
        "box-shadow:0 2px 8px rgba(0,0,0,.25);margin:14px auto;"
        f"width:{sheet_width}px;min-height:{sheet_height}px;"
        f"padding:{_padding_mm(margins['top'], top_px)}mm "
        f"{_padding_mm(margins['right'], right_px)}mm "
        f"{_padding_mm(margins['bottom'], bottom_px)}mm "
        f"{_padding_mm(margins['left'], left_px)}mm}}"
        f".rpt-page{{width:{printable_width}px;min-height:{page_content_height}px;"
        "background:transparent}"
    )


def _page_size_css(layout: dict[str, Any]) -> str:
    if is_ticket_page(layout):
        width_mm = int(layout.get("ticketWidthMm") or 76)
        height_mm = px_to_mm(layout.get("pageHeight") or 1123)
        return f"{width_mm}mm {height_mm:g}mm"
    page_size = str(layout.get("pageSize") or "A4")
    orientation = str(layout.get("orientation") or "portrait")
    return f"{page_size} {orientation}"


def _clamp_pair(first: int, second: int, bound: int) -> tuple[int, int]:
    total = first + second
    if total <= bound or total == 0:
        return first, second
    scale = bound / total
    return int(first * scale), int(second * scale)


def _padding_mm(raw_mm: float, clamped_px: int) -> float:
    if clamped_px == round(raw_mm * MM_TO_PX):
        return raw_mm
    return round(clamped_px / MM_TO_PX, 3)
