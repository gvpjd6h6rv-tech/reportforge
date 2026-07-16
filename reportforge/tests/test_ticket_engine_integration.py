from reportforge.core.render.engines.advanced_engine import AdvancedHtmlEngine


def test_ticket_engine_delegates_physical_page_and_preview_chrome():
    layout = {
        "name": "Ticket integration",
        "pageSize": "TICKET",
        "ticketWidthMm": 76,
        "pageHeight": 1600,
        "margins": {"top": 3, "bottom": 3, "left": 3, "right": 3},
        "sections": [],
        "elements": [],
    }

    pdf_html = AdvancedHtmlEngine(layout, {"items": []}).render()
    preview_html = AdvancedHtmlEngine(layout, {"items": []}).render_preview()

    assert "@page{size:76mm" in pdf_html
    assert "size: TICKET portrait" not in pdf_html
    assert "Página 'counter(page)'" not in pdf_html
    assert ".rpt-sheet{" in preview_html
    assert "width:287px" in preview_html
    assert "min-height:1600px" in preview_html
    assert "@page{" not in preview_html
