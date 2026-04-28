from __future__ import annotations

from typing import Any

STYPE_ALIASES: dict[str, str] = {
    "rh": "rh", "ph": "ph", "det": "det", "d": "det", "pf": "pf", "rf": "rf", "gh": "gh", "gf": "gf",
    "report_header": "rh", "page_header": "ph", "detail": "det",
    "page_footer": "pf", "report_footer": "rf", "group_header": "gh", "group_footer": "gf",
}
ELEMENT_TYPES = {"text", "field", "line", "rect", "image", "table", "chart", "subreport"}
PAGE_SIZES = {"A4": (794, 1123), "A3": (1123, 1587), "Letter": (816, 1056), "Legal": (816, 1344)}


def _mm(mm):
    return round(float(mm) * 96 / 25.4)


class Layout:
    def __init__(self, raw: dict):
        self.name = raw.get("name", "Untitled")
        self.version = raw.get("version", "1.0")
        self.doc_type = raw.get("docType", "generic")
        size = raw.get("pageSize", "A4")
        dw, dh = PAGE_SIZES.get(size, (794, 1123))
        self.page_width = int(raw.get("pageWidth", dw))
        self.page_height = int(raw.get("pageHeight", dh))
        m = raw.get("margins", {"top": 15, "bottom": 15, "left": 20, "right": 20})
        self.margin_mm = m
        self.content_x = _mm(m.get("left", 20))
        self.content_y = _mm(m.get("top", 15))
        self.content_w = self.page_width - _mm(m.get("left", 20)) - _mm(m.get("right", 20))
        self.content_h = self.page_height - _mm(m.get("top", 15)) - _mm(m.get("bottom", 15))
        self.groups = raw.get("groups", [])
        self.sections = self._parse_sections(raw.get("sections", []))
        self.elements = self._parse_elements(raw.get("elements", []))
        self._by_section: dict[str, list] = {}
        for el in self.elements:
            self._by_section.setdefault(el.sectionId, []).append(el)
        for lst in self._by_section.values():
            lst.sort(key=lambda e: e.zIndex)

    def _parse_sections(self, raw_list):
        sections, top = [], 0
        for r in raw_list:
            s = Section(r, top)
            top += s.height
            sections.append(s)
        return sections

    def _parse_elements(self, raw_list):
        result = []
        for r in raw_list:
            try:
                result.append(Element(r))
            except (KeyError, ValueError):
                pass
        return result

    def elements_for(self, sid):
        return self._by_section.get(sid, [])

    def get_section(self, sid):
        return next((s for s in self.sections if s.id == sid), None)

    def total_height(self):
        return sum(s.height for s in self.sections)

    def sections_of_type(self, stype: str) -> list:
        return [s for s in self.sections if s.stype == stype]

    @property
    def report_header(self):
        return next((s for s in self.sections if s.stype == "rh"), None)

    @property
    def page_header(self):
        return next((s for s in self.sections if s.stype == "ph"), None)

    @property
    def detail_section(self):
        return next((s for s in self.sections if s.stype == "det"), None)

    @property
    def detail_sections(self):
        return [s for s in self.sections if s.stype == "det"]

    @property
    def page_footer(self):
        return next((s for s in self.sections if s.stype == "pf"), None)

    @property
    def report_footer(self):
        return next((s for s in self.sections if s.stype == "rf"), None)

    @property
    def group_headers(self):
        return [s for s in self.sections if s.stype == "gh"]

    @property
    def group_footers(self):
        return [s for s in self.sections if s.stype == "gf"]

    def __repr__(self):
        return f"<Layout {self.name!r} s={len(self.sections)} e={len(self.elements)}>"


class Section:
    def __init__(self, raw: dict, top: int):
        rs = raw.get("stype", raw.get("type", "det"))
        self.id = raw.get("id", "")
        self.stype = STYPE_ALIASES.get(rs, "det")
        self.label = raw.get("label", self.stype)
        self.abbr = raw.get("abbr", self.stype[:2].upper())
        self.height = max(6, int(raw.get("height", 20)))
        self.top = top
        self.bottom = top + self.height
        self.iterates = raw.get("iterates")
        if self.iterates is None and self.stype == "det":
            self.iterates = "items"
        self.groupIndex = int(raw.get("groupIndex", 0))
        self.groupBy = raw.get("groupBy")
        self.groupSort = raw.get("groupSort", "asc")
        self.groupLabelField = raw.get("groupLabelField")
        self.keepTogether = bool(raw.get("keepTogether", False))
        self.repeatOnNewPage = bool(raw.get("repeatOnNewPage", False))
        self.pageBreakBefore = bool(raw.get("pageBreakBefore", False))
        self.pageBreakAfter = bool(raw.get("pageBreakAfter", False))
        self.newPageBefore = bool(raw.get("newPageBefore", False))
        self.newPageAfter = bool(raw.get("newPageAfter", False))
        self.printAtBottom = bool(raw.get("printAtBottom", False))
        self.suppress = raw.get("suppress", False)
        self.suppressFormula = raw.get("suppressFormula", "")
        self.suppressBlank = bool(raw.get("suppressBlank", False))
        self.bgColor = raw.get("bgColor", "transparent") or "transparent"

    @property
    def is_iterable(self):
        return bool(self.iterates)

    def __repr__(self):
        return f"<Section {self.id!r} {self.stype} h={self.height}>"


class Element:
    def __init__(self, raw: dict):
        self.id = raw.get("id", "")
        self.type = raw.get("type", "text")
        self.sectionId = raw.get("sectionId", "")
        self.x = int(raw.get("x", 0))
        self.y = int(raw.get("y", 0))
        self.w = max(1, int(raw.get("w", 100)))
        self.h = max(1, int(raw.get("h", 14)))
        self.fontFamily = raw.get("fontFamily", "Arial")
        self.fontSize = int(raw.get("fontSize", 8))
        self.bold = bool(raw.get("bold", False))
        self.italic = bool(raw.get("italic", False))
        self.underline = bool(raw.get("underline", False))
        self.align = raw.get("align", "left")
        self.color = raw.get("color", "#000000")
        self.bgColor = raw.get("bgColor", "transparent")
        self.borderColor = raw.get("borderColor", "transparent")
        self.borderWidth = int(raw.get("borderWidth", 0))
        self.borderStyle = raw.get("borderStyle", "solid")
        self.lineDir = raw.get("lineDir", "h")
        self.lineWidth = int(raw.get("lineWidth", 1))
        self.zIndex = int(raw.get("zIndex", 0))
        self.content = raw.get("content", "")
        self.fieldPath = raw.get("fieldPath", "")
        self.fieldFmt = raw.get("fieldFmt")
        self.canGrow = bool(raw.get("canGrow", False))
        self.canShrink = bool(raw.get("canShrink", False))
        self.wordWrap = bool(raw.get("wordWrap", False))
        self.suppressIfEmpty = bool(raw.get("suppressIfEmpty", False))
        self.src = raw.get("src", "")
        self.srcFit = raw.get("srcFit", "contain")
        self.conditionalStyles = list(raw.get("conditionalStyles", []))
        self.visibleIf = raw.get("visibleIf", "")
        self.style = raw.get("style", "") or raw.get("styleName", "")
        self.columns = list(raw.get("columns", []))
        self.chartType = raw.get("chartType", "bar")
        self.layoutPath = raw.get("layoutPath", "")
        self.dataPath = raw.get("dataPath", "")
        self.labelField = raw.get("labelField", "")
        self.valueField = raw.get("valueField", "")
        self.showLegend = bool(raw.get("showLegend", True))
        self.showGrid = bool(raw.get("showGrid", True))
        self.barcodeType = raw.get("barcodeType", "code128")
        self.showText = bool(raw.get("showText", True))
        self.rowField = raw.get("rowField", "")
        self.colField = raw.get("colField", "")
        self.summaryField = raw.get("summaryField", "")
        self.summary = raw.get("summary", "sum")
        self.htmlContent = raw.get("htmlContent", "")
        self.target = raw.get("target", "")

    @property
    def is_field(self):
        return self.type == "field"

    @property
    def is_text(self):
        return self.type == "text"

    @property
    def is_line(self):
        return self.type == "line"

    @property
    def is_rect(self):
        return self.type == "rect"

    @property
    def is_image(self):
        return self.type == "image"

    def effective_src(self):
        return self.src or self.content or self.fieldPath or ""

    def __repr__(self):
        return f"<Element {self.id!r} {self.type} ({self.x},{self.y}) {self.w}x{self.h}>"
