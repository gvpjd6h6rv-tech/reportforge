from __future__ import annotations

_NS = {"jr": "http://jasperreports.sourceforge.net/jasperreports"}

_BAND_MAP: dict[str, str] = {
    "title": "rh",
    "pageHeader": "ph",
    "columnHeader": "ph",
    "groupHeader": "gh",
    "detail": "det",
    "groupFooter": "gf",
    "columnFooter": "pf",
    "pageFooter": "pf",
    "summary": "rf",
    "lastPageFooter": "rf",
}

_JRXML_EL_MAP = {
    "staticText": "text",
    "textField": "field",
    "line": "line",
    "rectangle": "rect",
    "ellipse": "rect",
    "image": "image",
    "subreport": "subreport",
    "break": None,
}
