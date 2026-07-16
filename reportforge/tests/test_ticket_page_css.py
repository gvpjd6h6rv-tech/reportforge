from reportforge.core.render.engines.page_style import build_page_rule


def test_ticket_page_css_contract():
    margins = {"top": 3, "right": 3, "bottom": 3, "left": 3}
    ticket = {
        "pageSize": "TICKET",
        "ticketWidthMm": 76,
        "pageHeight": 1123,
    }
    ticket_rule = build_page_rule(ticket, margins)
    assert "size:76mm 297.127mm" in ticket_rule
    assert "margin:3mm 3mm 3mm 3mm" in ticket_rule
    assert "counter(page)" not in ticket_rule
    assert "size: TICKET" not in ticket_rule

    a4_rule = build_page_rule({"pageSize": "A4", "orientation": "portrait"}, margins)
    assert "size:A4 portrait" in a4_rule
    assert "counter(page)" in a4_rule
