from __future__ import annotations

from pathlib import Path
import xml.etree.ElementTree as ET

from .jrxml_constants import _BAND_MAP, _JRXML_EL_MAP
from .jrxml_elements import parse_element
from .jrxml_utils import next_section_id, tag_name


def parse_root(parser, root: ET.Element) -> dict:
    tag = tag_name(root)
    report = root if tag == "jasperReport" else (root.find("jasperReport") or root)

    pw = int(report.get("pageWidth", 595))
    ph = int(report.get("pageHeight", 842))
    lm = int(report.get("leftMargin", 20))
    rm = int(report.get("rightMargin", 20))
    tm = int(report.get("topMargin", 30))
    bm = int(report.get("bottomMargin", 30))
    name = report.get("name", "Imported Report")

    if pw <= 596 and ph <= 843:
        page_size = "A4"
    elif pw <= 816 and ph <= 1056:
        page_size = "Letter"
    else:
        page_size = "A4"

    sections, elements, groups = [], [], []
    parameters = []
    for p in (report.findall("parameter") + report.findall("{*}parameter")):
        pname = p.get("name", "")
        if pname and not pname.startswith("REPORT_"):
            parameters.append({"name": pname, "class": p.get("class", "java.lang.String")})

    for g in report.findall("group") + report.findall("{*}group"):
        gname = g.get("name", "Group1")
        expr_el = g.find("groupExpression") or g.find("{*}groupExpression")
        gexpr = parser._text_of(expr_el) if expr_el is not None else gname
        gfield = parser._group_field(gexpr)
        groups.append({"field": gfield, "sortDesc": False})

    band_sources = parser._band_sources(report)
    for band_name, band_container in band_sources:
        if band_container is None:
            continue
        bands = band_container.findall("band") + band_container.findall("{*}band")
        if not bands:
            bands = [band_container]
        for band in bands:
            stype = _BAND_MAP.get(band_name, "det")
            height = int(band.get("height", 20))
            sec_id = next_section_id(parser)
            sections.append({"id": sec_id, "stype": stype, "label": band_name, "height": height})
            for el_raw in parser._child_elements(band):
                el = parse_element(parser, el_raw, sec_id)
                if el:
                    elements.append(el)

    return {
        "name": name,
        "pageSize": page_size,
        "pageWidth": pw,
        "pageHeight": ph,
        "orientation": "landscape" if pw > ph else "portrait",
        "margins": {
            "top": round(tm / 3.7795, 1),
            "bottom": round(bm / 3.7795, 1),
            "left": round(lm / 3.7795, 1),
            "right": round(rm / 3.7795, 1),
        },
        "groups": groups,
        "sections": sections,
        "elements": elements,
        "parameters": parameters,
        "_source": "jrxml",
    }
