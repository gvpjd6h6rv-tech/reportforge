"""PV-ZOOM — horizontal overflow defense (white strip on zoom).

1 file = 1 responsibility: prove the ENGINE defends itself when an element
exceeds pageWidth, regardless of the JSON. The white strip at zoom 100->150
was caused by overflowing elements painting outside the page box.

Contract: .rpt-page must clip horizontal overflow (overflow:hidden) and the
page box width must equal pageWidth even when an element has x+w > pageWidth.
"""
import json
import os
import re
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from reportforge.core.render.engines.advanced_engine import AdvancedHtmlEngine  # noqa: E402

CANVAS_CSS = os.path.join(ROOT, "designer", "styles", "canvas.css")


def _overflowing_layout(page_width=671):
    return {
        "name": "overflow", "pageWidth": page_width, "pageSize": "A4",
        "margins": {"top": 15, "bottom": 15, "left": 20, "right": 20},
        "sections": [
            {"id": "s-rh", "stype": "rh", "height": 120},
            {"id": "s-det", "stype": "det", "height": 14, "iterates": "items"},
        ],
        "elements": [
            # deliberately overflows: x+w = 900 > 671
            {"id": "ov", "type": "text", "sectionId": "s-rh", "x": 600, "y": 10,
             "w": 300, "h": 16, "content": "OVERFLOW", "fontSize": 9},
        ],
    }


def test_rpt_page_clips_horizontal_overflow():
    layout = _overflowing_layout()
    html = AdvancedHtmlEngine(layout, {"items": [{"codigo": "C"}]}).render()
    m = re.search(r"\.rpt-page\{([^}]*)\}", html)
    assert m, "rpt-page rule must exist"
    assert "overflow:hidden" in m.group(1), "engine must clip page overflow to defend against white strip"


def test_rpt_page_width_equals_pagewidth_despite_overflow():
    layout = _overflowing_layout(671)
    html = AdvancedHtmlEngine(layout, {"items": [{"codigo": "C"}]}).render()
    widths = re.findall(r'class="rpt-page" style="width:(\d+)px', html)
    assert widths, "page must declare width"
    for w in widths:
        assert int(w) == 671, f"page width must stay at pageWidth (671), got {w}"


def test_canvas_layer_clips_overflow_in_design_css():
    css = open(CANVAS_CSS, encoding="utf-8").read()
    m = re.search(r"#canvas-layer\s*\{([^}]*)\}", css)
    assert m, "#canvas-layer rule must exist"
    assert "overflow: hidden" in m.group(1) or "overflow:hidden" in m.group(1), \
        "#canvas-layer must clip overflow so zoom shows no white strip"


@pytest.mark.parametrize("name", ["factura_a4.json", "guia_remision_a4.json"])
def test_real_layouts_render_with_clipping(name):
    path = os.path.join(ROOT, "examples", name)
    if not os.path.exists(path):
        pytest.skip(f"missing {name}")
    layout = json.load(open(path, encoding="utf-8"))
    html = AdvancedHtmlEngine(layout, {"items": [{"codigo": "C", "descripcion": "X"}]}).render()
    m = re.search(r"\.rpt-page\{([^}]*)\}", html)
    assert "overflow:hidden" in m.group(1), f"{name}: page must clip overflow"
    # every page width == declared pageWidth
    for w in re.findall(r'class="rpt-page" style="width:(\d+)px', html):
        assert int(w) == int(layout["pageWidth"]), f"{name}: page width drift"
