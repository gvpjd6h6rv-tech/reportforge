from __future__ import annotations

from typing import Optional
import xml.etree.ElementTree as ET

from .jrxml_constants import _JRXML_EL_MAP
from .jrxml_utils import convert_expr, guess_fmt, next_element_id, tag_name


def parse_element(parser, el: ET.Element, sec_id: str) -> Optional[dict]:
    etype = _JRXML_EL_MAP.get(tag_name(el))
    if etype is None:
        return None

    re_el = el.find("reportElement") or el.find("{*}reportElement")
    if re_el is None:
        return None

    x = int(re_el.get("x", 0))
    y = int(re_el.get("y", 0))
    w = int(re_el.get("width", 100))
    h = int(re_el.get("height", 16))
    el_id = next_element_id(parser)

    font_el = el.find("textElement/font") or el.find("{*}textElement/{*}font")
    font_family = "Arial"
    font_size = 9
    bold = italic = underline = False
    align = "left"
    color = "#000000"
    bg = "transparent"

    if font_el is not None:
        font_family = font_el.get("fontName", "Arial")
        font_size = int(font_el.get("size", 9))
        bold = font_el.get("isBold", "false").lower() == "true"
        italic = font_el.get("isItalic", "false").lower() == "true"
        underline = font_el.get("isUnderline", "false").lower() == "true"

    te_el = el.find("textElement") or el.find("{*}textElement")
    if te_el is not None:
        align = {"Left": "left", "Center": "center", "Right": "right", "Justified": "justify"}.get(
            te_el.get("textAlignment", "Left"),
            "left",
        )

    box_el = el.find("box") or el.find("{*}box")
    border_width = 0
    border_color = "#000000"
    border_style = "solid"
    if box_el is not None:
        border_width = int(box_el.get("border", 0))

    gr_el = el.find("graphicElement") or el.find("{*}graphicElement")
    if gr_el is not None:
        fg_el = gr_el.find("pen") or gr_el.find("{*}pen")
        if fg_el is not None:
            border_width = float(fg_el.get("lineWidth", 1))

    base = {
        "id": el_id,
        "type": etype,
        "sectionId": sec_id,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "fontFamily": font_family,
        "fontSize": font_size,
        "bold": bold,
        "italic": italic,
        "underline": underline,
        "align": align,
        "color": color,
        "bgColor": bg,
        "borderWidth": border_width,
        "borderColor": border_color,
        "borderStyle": border_style,
        "zIndex": 0,
    }

    if etype == "text":
        expr = el.find("text") or el.find("{*}text")
        base["content"] = parser._text_of(expr) if expr is not None else ""
    elif etype == "field":
        expr_el = el.find("textFieldExpression") or el.find("{*}textFieldExpression")
        expr = parser._text_of(expr_el) if expr_el is not None else ""
        base["fieldPath"] = convert_expr(expr)
        base["content"] = ""
        pat = el.get("pattern", "")
        if pat:
            base["fieldFmt"] = guess_fmt(pat)
    elif etype == "image":
        expr_el = el.find("imageExpression") or el.find("{*}imageExpression")
        src = parser._text_of(expr_el) if expr_el is not None else ""
        base["src"] = convert_expr(src)
    elif etype == "line":
        base["lineDir"] = "h"
        base["lineWidth"] = max(1, border_width)
    elif etype == "subreport":
        sr_expr = el.find("subreportExpression") or el.find("{*}subreportExpression")
        base["layoutPath"] = parser._text_of(sr_expr) if sr_expr is not None else ""
        dp_el = el.find("dataSourceExpression") or el.find("{*}dataSourceExpression")
        if dp_el is not None:
            base["dataPath"] = convert_expr(parser._text_of(dp_el))
    return base

