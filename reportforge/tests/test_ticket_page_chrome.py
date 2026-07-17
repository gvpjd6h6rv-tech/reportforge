from reportforge.core.render.engines.page_style import build_preview_chrome


def test_ticket_preview_chrome_uses_physical_width_and_continuous_height():
    layout = {
        "pageSize": "TICKET",
        "ticketWidthMm": 76,
        "pageWidth": 287,
        "pageHeight": 1600,
    }
    margins = {"top": 3, "right": 3, "bottom": 3, "left": 3}

    css = build_preview_chrome(layout, margins, 287, 1600, 265)

    assert "width:287px" in css
    assert "min-height:1600px" in css
    assert "padding:3mm 3mm 3mm 3mm" in css
    assert ".rpt-page{width:265px" in css
