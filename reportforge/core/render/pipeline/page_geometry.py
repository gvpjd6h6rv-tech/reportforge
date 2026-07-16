# core/render/pipeline/page_geometry.py
# Canonical physical page geometry for standard sheets and continuous tickets.
from __future__ import annotations

from typing import Any

MM_TO_PX = 96 / 25.4
LEGACY_MM_TO_PX = 3.7795
STANDARD_PAGE_MM = {
    "A4": (210.0, 297.0),
    "A3": (297.0, 420.0),
    "Letter": (215.9, 279.4),
    "Legal": (215.9, 355.6),
}
TICKET_WIDTHS_MM = (58, 70, 76)
DEFAULT_TICKET_WIDTH_MM = 76
DEFAULT_TICKET_HEIGHT_MM = 297.0


def mm_to_px(value: float) -> int:
    return round(float(value) * MM_TO_PX)


def px_to_mm(value: float) -> float:
    return round(float(value) / MM_TO_PX, 3)


def is_ticket_page(layout: dict[str, Any]) -> bool:
    return str(layout.get("pageSize") or "A4").upper() == "TICKET"


def normalize_page_geometry(raw: dict[str, Any]) -> dict[str, Any]:
    page_size = str(_pick(raw, "pageSize", "page_size", "paper") or "A4")
    orientation = str(_pick(raw, "orientation", "orient") or "portrait").lower()
    if page_size.upper() == "TICKET":
        return _normalize_ticket(raw)
    return _normalize_standard(raw, page_size, orientation)


def standard_sheet_px(page_size: str, orientation: str) -> tuple[int, int]:
    width_mm, height_mm = STANDARD_PAGE_MM.get(page_size, STANDARD_PAGE_MM["A4"])
    if orientation == "landscape":
        width_mm, height_mm = height_mm, width_mm
    return round(width_mm * LEGACY_MM_TO_PX), round(height_mm * LEGACY_MM_TO_PX)


def _normalize_ticket(raw: dict[str, Any]) -> dict[str, Any]:
    width_mm = _ticket_width(raw)
    height_px = _positive_int(
        _pick(raw, "pageHeight", "page_height", "height"),
        mm_to_px(DEFAULT_TICKET_HEIGHT_MM),
    )
    return {
        "pageSize": "TICKET",
        "orientation": "portrait",
        "ticketWidthMm": width_mm,
        "pageWidth": mm_to_px(width_mm),
        "pageHeight": height_px,
        "continuousPaper": True,
    }


def _normalize_standard(raw: dict[str, Any], page_size: str, orientation: str) -> dict[str, Any]:
    width_mm, height_mm = STANDARD_PAGE_MM.get(page_size, STANDARD_PAGE_MM["A4"])
    if orientation == "landscape":
        width_mm, height_mm = height_mm, width_mm
    width_px = _positive_int(
        _pick(raw, "pageWidth", "page_width", "width"),
        int(width_mm * LEGACY_MM_TO_PX),
    )
    height_px = _positive_int(
        _pick(raw, "pageHeight", "page_height", "height"),
        round(height_mm * LEGACY_MM_TO_PX),
    )
    return {
        "pageSize": page_size,
        "orientation": orientation,
        "ticketWidthMm": None,
        "pageWidth": width_px,
        "pageHeight": height_px,
        "continuousPaper": False,
    }


def _ticket_width(raw: dict[str, Any]) -> int:
    explicit = _number(_pick(raw, "ticketWidthMm", "ticket_width_mm"))
    if explicit in TICKET_WIDTHS_MM:
        return int(explicit)
    page_width = _number(_pick(raw, "pageWidth", "page_width", "width"))
    if page_width and page_width > 0:
        return min(TICKET_WIDTHS_MM, key=lambda width: abs(mm_to_px(width) - page_width))
    return DEFAULT_TICKET_WIDTH_MM


def _positive_int(value: Any, default: int) -> int:
    number = _number(value)
    return int(number) if number is not None and number > 0 else default


def _number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _pick(raw: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in raw and raw[key] is not None:
            return raw[key]
    return None
