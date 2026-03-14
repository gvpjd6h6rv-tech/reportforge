# core/render/jrxml_parser.py
# JRXML Parser — converts JasperReports XML to ReportForge layout dicts.
# Pipeline: JRXML → parse XML → Layout dict → HtmlEngine → PDF
from __future__ import annotations
import re, xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Optional

# Namespace used in JRXML files
_NS = {"jr": "http://jasperreports.sourceforge.net/jasperreports"}

# ── Band type mapping ──────────────────────────────────────────────
_BAND_MAP: dict[str, str] = {
    "title":         "rh",
    "pageHeader":    "ph",
    "columnHeader":  "ph",
    "groupHeader":   "gh",
    "detail":        "det",
    "groupFooter":   "gf",
    "columnFooter":  "pf",
    "pageFooter":    "pf",
    "summary":       "rf",
    "lastPageFooter":"rf",
}

# ── Element type mapping ────────────────────────────────────────────
_JRXML_EL_MAP = {
    "staticText":   "text",
    "textField":    "field",
    "line":         "line",
    "rectangle":    "rect",
    "ellipse":      "rect",
    "image":        "image",
    "subreport":    "subreport",
    "break":        None,   # page/column breaks (handled separately)
}


class JrxmlParser:
    """
    Parse a JRXML file and convert it to a ReportForge layout dict.
    
    Usage:
        parser = JrxmlParser()
        layout = parser.parse("report.jrxml")
        html   = EnterpriseEngine(layout, data).render()
    
    Also available as module-level:
        render_from_jrxml(data, jrxml_path, output_path)
    """

    def __init__(self):
        self._sec_counter = 0
        self._el_counter  = 0

    def parse(self, path: str | Path) -> dict:
        """Parse JRXML file and return a ReportForge layout dict."""
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"JRXML not found: {path}")
        tree = ET.parse(str(path))
        root = tree.getroot()
        return self._parse_root(root)

    def parse_string(self, xml_str: str) -> dict:
        """Parse JRXML from string."""
        root = ET.fromstring(xml_str)
        return self._parse_root(root)

    # ── Root ──────────────────────────────────────────────────────
    def _parse_root(self, root: ET.Element) -> dict:
        # Strip namespace from tag if present
        tag = root.tag.split("}")[1] if "}" in root.tag else root.tag
        if tag == "jasperReport":
            report = root
        else:
            report = root.find("jasperReport") or root

        pw = int(report.get("pageWidth",  595))
        ph = int(report.get("pageHeight", 842))
        lm = int(report.get("leftMargin",  20))
        rm = int(report.get("rightMargin", 20))
        tm = int(report.get("topMargin",   30))
        bm = int(report.get("bottomMargin",30))
        name = report.get("name", "Imported Report")

        # Page size detection
        if pw <= 596 and ph <= 843:
            page_size = "A4"
        elif pw <= 816 and ph <= 1056:
            page_size = "Letter"
        else:
            page_size = "A4"

        sections, elements = [], []
        groups = []

        # Parse parameters
        parameters = []
        for p in (report.findall("parameter") + report.findall("{*}parameter")):
            pname = p.get("name", "")
            if pname and not pname.startswith("REPORT_"):
                parameters.append({"name": pname,
                                    "class": p.get("class", "java.lang.String")})

        # Parse groups first
        for g in report.findall("group") + report.findall("{*}group"):
            gname = g.get("name", "Group1")
            expr_el = (g.find("groupExpression") or
                       g.find("{*}groupExpression"))
            gexpr = self._text_of(expr_el) if expr_el is not None else gname
            gfield = re.sub(r'[^a-zA-Z0-9_]', '', gexpr.strip("$FP{}"))
            groups.append({"field": gfield, "sortDesc": False})

        # Parse bands (sections)
        band_sources = [
            ("title",         report.find("title")         or report.find("{*}title")),
            ("pageHeader",    report.find("pageHeader")    or report.find("{*}pageHeader")),
            ("columnHeader",  report.find("columnHeader")  or report.find("{*}columnHeader")),
        ]
        # Add group bands
        for g in report.findall("group") + report.findall("{*}group"):
            gh = g.find("groupHeader")  or g.find("{*}groupHeader")
            gf = g.find("groupFooter")  or g.find("{*}groupFooter")
            if gh is not None: band_sources.append(("groupHeader", gh))
            if gf is not None: band_sources.append(("groupFooter", gf))

        band_sources += [
            ("detail",        report.find("detail")        or report.find("{*}detail")),
            ("columnFooter",  report.find("columnFooter")  or report.find("{*}columnFooter")),
            ("pageFooter",    report.find("pageFooter")    or report.find("{*}pageFooter")),
            ("summary",       report.find("summary")       or report.find("{*}summary")),
        ]

        for band_name, band_container in band_sources:
            if band_container is None:
                continue
            # band container may have <band> children
            bands = (band_container.findall("band") +
                     band_container.findall("{*}band"))
            if not bands:
                bands = [band_container]  # treat container itself as band
            for band in bands:
                stype  = _BAND_MAP.get(band_name, "det")
                height = int(band.get("height", 20))
                sec_id = self._sec_id()
                sections.append({
                    "id":     sec_id,
                    "stype":  stype,
                    "label":  band_name,
                    "height": height,
                })
                # Parse elements within band
                for el_raw in self._child_elements(band):
                    el = self._parse_element(el_raw, sec_id)
                    if el:
                        elements.append(el)

        return {
            "name":        name,
            "pageSize":    page_size,
            "pageWidth":   pw,
            "pageHeight":  ph,
            "orientation": "landscape" if pw > ph else "portrait",
            "margins": {
                "top":    round(tm / 3.7795, 1),
                "bottom": round(bm / 3.7795, 1),
                "left":   round(lm / 3.7795, 1),
                "right":  round(rm / 3.7795, 1),
            },
            "groups":   groups,
            "sections": sections,
            "elements": elements,
            "parameters": parameters,
            "_source":  "jrxml",
        }

    # ── Elements ──────────────────────────────────────────────────
    def _parse_element(self, el: ET.Element, sec_id: str) -> Optional[dict]:
        tag   = el.tag.split("}")[1] if "}" in el.tag else el.tag
        etype = _JRXML_EL_MAP.get(tag)
        if etype is None:
            return None

        # Geometry from <reportElement>
        re_el = (el.find("reportElement") or
                 el.find("{*}reportElement"))
        if re_el is None:
            return None

        x = int(re_el.get("x", 0))
        y = int(re_el.get("y", 0))
        w = int(re_el.get("width", 100))
        h = int(re_el.get("height", 16))
        el_id = self._el_id()

        # Font
        tf_el = (el.find("textElement/font") or
                 el.find("{*}textElement/{*}font") or
                 el.find("textField/textFieldExpression") or None)
        font_el = (el.find("textElement/font") or
                   el.find("{*}textElement/{*}font"))
        font_family = "Arial"
        font_size   = 9
        bold = italic = underline = False
        align = "left"
        color = "#000000"
        bg    = "transparent"

        if font_el is not None:
            font_family = font_el.get("fontName", "Arial")
            font_size   = int(font_el.get("size", 9))
            bold        = font_el.get("isBold", "false").lower() == "true"
            italic      = font_el.get("isItalic", "false").lower() == "true"
            underline   = font_el.get("isUnderline", "false").lower() == "true"

        te_el = el.find("textElement") or el.find("{*}textElement")
        if te_el is not None:
            align = {"Left":"left","Center":"center","Right":"right",
                     "Justified":"justify"}.get(te_el.get("textAlignment","Left"), "left")

        box_el = el.find("box") or el.find("{*}box")
        border_width = 0
        border_color = "#000000"
        border_style = "solid"
        if box_el is not None:
            border_width = int(box_el.get("border", 0))

        # Graphic element
        gr_el = el.find("graphicElement") or el.find("{*}graphicElement")
        if gr_el is not None:
            fg_el = gr_el.find("pen") or gr_el.find("{*}pen")
            if fg_el is not None:
                border_width = float(fg_el.get("lineWidth", 1))

        base = {
            "id":          el_id,
            "type":        etype,
            "sectionId":   sec_id,
            "x": x, "y": y, "w": w, "h": h,
            "fontFamily":  font_family,
            "fontSize":    font_size,
            "bold":        bold,
            "italic":      italic,
            "underline":   underline,
            "align":       align,
            "color":       color,
            "bgColor":     bg,
            "borderWidth": border_width,
            "borderColor": border_color,
            "borderStyle": border_style,
            "zIndex": 0,
        }

        # Type-specific
        if etype == "text":
            expr = el.find("text") or el.find("{*}text")
            base["content"] = self._text_of(expr) if expr is not None else ""

        elif etype == "field":
            expr_el = (el.find("textFieldExpression") or
                       el.find("{*}textFieldExpression"))
            expr    = self._text_of(expr_el) if expr_el is not None else ""
            # Convert JRXML $F{field} to field.name
            fp = self._convert_expr(expr)
            base["fieldPath"] = fp
            base["content"]   = ""
            # Format from pattern
            pat = el.get("pattern", "")
            if pat:
                base["fieldFmt"] = _guess_fmt(pat)

        elif etype == "image":
            expr_el = (el.find("imageExpression") or
                       el.find("{*}imageExpression"))
            src = self._text_of(expr_el) if expr_el is not None else ""
            base["src"] = self._convert_expr(src)

        elif etype == "line":
            base["lineDir"]   = "h"
            base["lineWidth"] = max(1, border_width)

        elif etype == "rect":
            pass  # already set

        elif etype == "subreport":
            sr_expr = (el.find("subreportExpression") or
                       el.find("{*}subreportExpression"))
            base["layoutPath"] = self._text_of(sr_expr) if sr_expr is not None else ""
            dp_el = (el.find("dataSourceExpression") or
                     el.find("{*}dataSourceExpression"))
            if dp_el is not None:
                base["dataPath"] = self._convert_expr(self._text_of(dp_el))

        return base

    # ── Helpers ───────────────────────────────────────────────────
    def _child_elements(self, band: ET.Element) -> list[ET.Element]:
        """Return all child elements that are reportable."""
        result = []
        for child in band:
            tag = child.tag.split("}")[1] if "}" in child.tag else child.tag
            if tag in _JRXML_EL_MAP:
                result.append(child)
        return result

    def _text_of(self, el: Optional[ET.Element]) -> str:
        if el is None:
            return ""
        return (el.text or "").strip()

    def _convert_expr(self, expr: str) -> str:
        """Convert JRXML expression syntax to ReportForge field path."""
        if not expr:
            return ""
        # $F{fieldName} → item.fieldName
        expr = re.sub(r'\$F\{(\w+)\}', r'item.\1', expr)
        # $P{paramName} → param.paramName
        expr = re.sub(r'\$P\{(\w+)\}', r'param.\1', expr)
        # $V{variableName} → \1 (variable)
        expr = re.sub(r'\$V\{(\w+)\}', r'\1', expr)
        # Remove Java string literals quotes
        expr = expr.strip('"\'')
        # Java string concat "text" + $F{x} → text{item.x}
        expr = re.sub(r'"([^"]*)"', r'\1', expr)
        return expr.strip()

    def _sec_id(self) -> str:
        self._sec_counter += 1
        return f"jrxml-sec-{self._sec_counter}"

    def _el_id(self) -> str:
        self._el_counter += 1
        return f"jrxml-el-{self._el_counter}"


def _guess_fmt(pattern: str) -> str:
    """Map JasperReports format pattern to ReportForge fieldFmt."""
    p = pattern.lower()
    if "#,##0.00" in p or "currency" in p:
        return "currency"
    if "#,##0" in p:
        return "int"
    if "%" in p:
        return "pct"
    if "yyyy" in p or "mm/dd" in p or "dd/mm" in p:
        return "date"
    return ""


# ── Module-level API ──────────────────────────────────────────────
def render_from_jrxml(data: dict | str | Path,
                      jrxml_path: str | Path,
                      output_path: str | Path = None,
                      params: dict = None,
                      **engine_kwargs) -> str:
    """
    Full pipeline: JRXML → parse → EnterpriseEngine → HTML (→ PDF).
    
    Args:
        data:        Report data dict or path to JSON file.
        jrxml_path:  Path to .jrxml file.
        output_path: Optional path to write HTML output.
        params:      Report parameters dict.
    
    Returns:
        HTML string.
    """
    import json
    from .engines.enterprise_engine import EnterpriseEngine

    jrxml_path = Path(jrxml_path)
    parser = JrxmlParser()
    layout = parser.parse(jrxml_path)

    if isinstance(data, (str, Path)):
        data = json.loads(Path(data).read_text(encoding="utf-8"))

    engine = EnterpriseEngine(layout, data, params=params or {},
                              layout_path=jrxml_path, **engine_kwargs)
    html = engine.render()

    if output_path:
        Path(output_path).write_text(html, encoding="utf-8")

    return html
