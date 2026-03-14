# core/render/compat/jrxml_parser.py
# JRXML ↔ ReportForge layout compatibility layer.
# Aliases to main jrxml_parser + layout_to_jrxml conversion.
from __future__ import annotations
import re, xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

# Re-export everything from the main parser
from ..jrxml_parser import (
    JrxmlParser,
    render_from_jrxml,
    _guess_fmt as _pattern2fmt,
)


def parse_jrxml(path: str | Path) -> dict:
    """Parse JRXML file to ReportForge layout dict."""
    return JrxmlParser().parse(path)


def parse_jrxml_string(xml_str: str) -> dict:
    """Parse JRXML XML string to ReportForge layout dict."""
    return JrxmlParser().parse_string(xml_str)


def layout_to_jrxml(layout: dict) -> str:
    """
    Convert a ReportForge layout dict back to JRXML format.
    Enables round-trip conversion.
    """
    name    = layout.get("name", "Report")
    pw      = layout.get("pageWidth",  595)
    ph      = layout.get("pageHeight", 842)
    margins = layout.get("margins", {"top":30,"bottom":30,"left":20,"right":20})
    lm = int(margins.get("left",   20) * 3.7795)
    rm = int(margins.get("right",  20) * 3.7795)
    tm = int(margins.get("top",    30) * 3.7795)
    bm = int(margins.get("bottom", 30) * 3.7795)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports"',
        f'              name="{_xe(name)}"',
        f'              pageWidth="{pw}" pageHeight="{ph}"',
        f'              leftMargin="{lm}" rightMargin="{rm}"',
        f'              topMargin="{tm}" bottomMargin="{bm}">',
    ]

    # Parameters
    params = layout.get("parameters", [])
    for p in params:
        lines.append(f'  <parameter name="{_xe(p["name"])}" class="java.lang.String"/>')

    # Fields from detail elements
    fields_seen = set()
    for el in layout.get("elements", []):
        fp = el.get("fieldPath", "")
        if fp and fp.startswith("item."):
            fname = fp[5:]
            if fname not in fields_seen:
                fields_seen.add(fname)
                lines.append(f'  <field name="{_xe(fname)}" class="java.lang.Object"/>')

    # Bands
    band_map_inv = {
        "rh": "title", "ph": "pageHeader",
        "gh": "groupHeader", "gf": "groupFooter",
        "det": "detail",
        "pf": "pageFooter", "rf": "summary",
    }
    stype_to_elements: dict[str, list] = {}
    for el in layout.get("elements", []):
        sid = el.get("sectionId", "")
        stype_to_elements.setdefault(sid, []).append(el)

    for sec in layout.get("sections", []):
        stype  = sec.get("stype", "det")
        height = sec.get("height", 20)
        band   = band_map_inv.get(stype, "detail")
        els    = stype_to_elements.get(sec.get("id", ""), [])

        lines.append(f'  <{band}>')
        lines.append(f'    <band height="{height}">')
        for el in els:
            lines.extend(_el_to_jrxml(el))
        lines.append(f'    </band>')
        lines.append(f'  </{band}>')

    lines.append('</jasperReport>')
    return "\n".join(lines)


def _el_to_jrxml(el: dict) -> list[str]:
    etype = el.get("type", "text")
    x, y, w, h = el.get("x",0), el.get("y",0), el.get("w",100), el.get("h",16)
    fs    = el.get("fontSize", 9)
    bold  = "true" if el.get("bold") else "false"
    align_map = {"left":"Left","center":"Center","right":"Right","justify":"Justified"}
    align = align_map.get(el.get("align","left"), "Left")

    re_line = f'      <reportElement x="{x}" y="{y}" width="{w}" height="{h}"/>'
    te_line = (f'      <textElement textAlignment="{align}">'
               f'<font fontName="Arial" size="{fs}" isBold="{bold}"/>'
               f'</textElement>')

    if etype == "text":
        return [
            "      <staticText>", re_line, te_line,
            f'      <text>{_xe(el.get("content",""))}</text>',
            "      </staticText>",
        ]
    elif etype == "field":
        fp  = el.get("fieldPath", "")
        expr= _rf_to_jrxml_expr(fp)
        fmt = el.get("fieldFmt", "")
        pat = _fmt_to_pattern(fmt)
        pat_attr = f' pattern="{pat}"' if pat else ''
        return [
            f'      <textField{pat_attr}>', re_line, te_line,
            f'      <textFieldExpression>{_xe(expr)}</textFieldExpression>',
            "      </textField>",
        ]
    elif etype == "line":
        return [
            "      <line>", re_line,
            '      <graphicElement><pen lineWidth="1.0"/></graphicElement>',
            "      </line>",
        ]
    elif etype in ("rect", "image"):
        return ["      <rectangle>", re_line, "      </rectangle>"]
    return []


def _rf_to_jrxml_expr(path: str) -> str:
    """Convert item.field → $F{field}, param.x → $P{x}."""
    if path.startswith("item."):
        return f'$F{{{path[5:]}}}'
    if path.startswith("param."):
        return f'$P{{{path[6:]}}}'
    return path


def _fmt_to_pattern(fmt: str) -> str:
    mapping = {
        "currency": "#,##0.00", "currency_sign": "#,##0.00",
        "int": "#,##0", "float2": "#,##0.00",
        "pct": "##0.0%", "date": "dd/MM/yyyy",
        "datetime": "dd/MM/yyyy HH:mm:ss",
    }
    return mapping.get(fmt or "", "")


def _xe(s: str) -> str:
    import html
    return html.escape(str(s))
