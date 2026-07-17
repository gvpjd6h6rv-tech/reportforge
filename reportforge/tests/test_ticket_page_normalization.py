from reportforge.core.render.pipeline.normalizer import normalize_layout


def test_ticket_page_normalization_contract():
    expected_px = {58: 219, 70: 265, 76: 287}
    for width_mm, width_px in expected_px.items():
        normalized = normalize_layout({
            "pageSize": "TICKET",
            "ticketWidthMm": width_mm,
            "pageHeight": 1400,
            "margins": 3,
        })
        assert normalized["pageSize"] == "TICKET"
        assert normalized["orientation"] == "portrait"
        assert normalized["ticketWidthMm"] == width_mm
        assert normalized["pageWidth"] == width_px
        assert normalized["pageHeight"] == 1400
        assert normalized["continuousPaper"] is True

    inferred = normalize_layout({"pageSize": "TICKET", "pageWidth": 264})
    assert inferred["ticketWidthMm"] == 70
    assert inferred["pageWidth"] == 265
    assert inferred["margins"] == {"top": 3, "bottom": 3, "left": 3, "right": 3}

    a4 = normalize_layout({"pageSize": "A4", "pageWidth": 794, "pageHeight": 1123})
    assert a4["pageSize"] == "A4"
    assert a4["pageWidth"] == 794
    assert a4["pageHeight"] == 1123
    assert a4["ticketWidthMm"] is None
    assert a4["continuousPaper"] is False
