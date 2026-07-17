from reportforge.core.render.engines.page_style import preview_sheet_px
from reportforge.core.render.pipeline.normalizer import normalize_layout


def test_ticket_preview_geometry_parity_contract():
    for width_mm in (58, 70, 76):
        normalized = normalize_layout({
            "pageSize": "TICKET",
            "ticketWidthMm": width_mm,
            "pageHeight": 1500,
        })
        sheet = preview_sheet_px(
            normalized,
            normalized["pageWidth"],
            normalized["pageHeight"],
        )
        assert sheet == (normalized["pageWidth"], normalized["pageHeight"])

    a4 = normalize_layout({"pageSize": "A4", "pageWidth": 754, "pageHeight": 900})
    assert preview_sheet_px(a4, a4["pageWidth"], a4["pageHeight"]) == (794, 1123)
