# core/render/engines/page_style.py
# Converts canonical page geometry into preview dimensions and paged-media CSS.
from __future__ import annotations

from typing import Any

from ..pipeline.page_geometry import is_ticket_page, px_to_mm, standard_sheet_px

MM_TO_PX = 3.7795


def preview_sheet_px(layout: dict[str, Any], page_width: int, page_height: int) -> tuple[int, int]: