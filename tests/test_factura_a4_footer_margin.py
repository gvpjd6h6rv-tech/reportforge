import json
from pathlib import Path


def test_factura_a4_uses_reportforge_671_grid():
    layout = json.loads(Path("reportforge/layouts/factura_a4.json").read_text(encoding="utf-8"))

    assert layout["pageSize"] == "A4"
    assert layout["pageWidth"] == 671


def test_factura_a4_footer_elements_have_bottom_margin():
    layout = json.loads(Path("reportforge/layouts/factura_a4.json").read_text(encoding="utf-8"))

    footer = next(section for section in layout["sections"] if section["id"] == "s-rf")
    footer_height = footer["height"]

    footer_elements = [
        element for element in layout["elements"]
        if element.get("sectionId") == "s-rf"
    ]

    offenders = []
    for element in footer_elements:
        bottom = float(element.get("y", 0)) + float(element.get("h", 0))
        margin = footer_height - bottom
        if margin < 8:
            offenders.append((element.get("id"), margin, bottom, footer_height))

    assert offenders == []
