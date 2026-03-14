# core/render/resolvers/layout_loader.py
from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Optional

STYPE_ALIASES: dict[str, str] = {
    "rh":"rh","ph":"ph","det":"det","d":"det","pf":"pf","rf":"rf","gh":"gh","gf":"gf",
    "report_header":"rh","page_header":"ph","detail":"det",
    "page_footer":"pf","report_footer":"rf","group_header":"gh","group_footer":"gf",
}
ELEMENT_TYPES = {"text","field","line","rect","image","table","chart","subreport"}
PAGE_SIZES = {"A4":(794,1123),"A3":(1123,1587),"Letter":(816,1056),"Legal":(816,1344)}

def _mm(mm):
    return round(float(mm)*96/25.4)

class Layout:
    def __init__(self, raw:dict):
        self.name      = raw.get("name","Untitled")
        self.version   = raw.get("version","1.0")
        self.doc_type  = raw.get("docType","generic")
        size           = raw.get("pageSize","A4")
        dw,dh          = PAGE_SIZES.get(size,(794,1123))
        self.page_width  = int(raw.get("pageWidth",  dw))
        self.page_height = int(raw.get("pageHeight", dh))
        m = raw.get("margins",{"top":15,"bottom":15,"left":20,"right":20})
        self.margin_mm   = m
        self.content_x   = _mm(m.get("left",20))
        self.content_y   = _mm(m.get("top",15))
        self.content_w   = self.page_width  - _mm(m.get("left",20)) - _mm(m.get("right",20))
        self.content_h   = self.page_height - _mm(m.get("top",15))  - _mm(m.get("bottom",15))
        self.groups      = raw.get("groups",[])
        self.sections    = self._parse_sections(raw.get("sections",[]))
        self.elements    = self._parse_elements(raw.get("elements",[]))
        self._by_section: dict[str,list] = {}
        for el in self.elements:
            self._by_section.setdefault(el.sectionId,[]).append(el)
        for lst in self._by_section.values():
            lst.sort(key=lambda e:e.zIndex)

    def _parse_sections(self, raw_list):
        sections,top = [],0
        for r in raw_list:
            s = Section(r,top); top += s.height; sections.append(s)
        return sections

    def _parse_elements(self, raw_list):
        result = []
        for r in raw_list:
            try: result.append(Element(r))
            except (KeyError,ValueError): pass
        return result

    def elements_for(self, sid): return self._by_section.get(sid,[])
    def get_section(self, sid):  return next((s for s in self.sections if s.id==sid),None)
    def total_height(self):      return sum(s.height for s in self.sections)

    @property
    def report_header(self):   return next((s for s in self.sections if s.stype=="rh"),None)
    @property
    def page_header(self):     return next((s for s in self.sections if s.stype=="ph"),None)
    @property
    def detail_section(self):  return next((s for s in self.sections if s.stype=="det"),None)
    @property
    def detail_sections(self): return [s for s in self.sections if s.stype=="det"]
    @property
    def page_footer(self):     return next((s for s in self.sections if s.stype=="pf"),None)
    @property
    def report_footer(self):   return next((s for s in self.sections if s.stype=="rf"),None)
    @property
    def group_headers(self):   return [s for s in self.sections if s.stype=="gh"]
    @property
    def group_footers(self):   return [s for s in self.sections if s.stype=="gf"]
    def __repr__(self):        return f"<Layout {self.name!r} s={len(self.sections)} e={len(self.elements)}>"


class Section:
    def __init__(self, raw:dict, top:int):
        rs = raw.get("stype", raw.get("type","det"))
        self.id       = raw.get("id","")
        self.stype    = STYPE_ALIASES.get(rs,"det")
        self.label    = raw.get("label",self.stype)
        self.abbr     = raw.get("abbr",self.stype[:2].upper())
        self.height   = max(6, int(raw.get("height",20)))
        self.top      = top
        self.bottom   = top + self.height
        self.iterates = raw.get("iterates")
        if self.iterates is None and self.stype=="det":
            self.iterates = "items"
        # Grouping
        self.groupIndex      = int(raw.get("groupIndex",0))
        self.groupBy         = raw.get("groupBy")
        self.groupSort       = raw.get("groupSort","asc")
        self.groupLabelField = raw.get("groupLabelField")
        # Pagination
        self.keepTogether    = bool(raw.get("keepTogether",False))
        self.repeatOnNewPage = bool(raw.get("repeatOnNewPage",False))
        self.pageBreakBefore = bool(raw.get("pageBreakBefore",False))
        self.pageBreakAfter  = bool(raw.get("pageBreakAfter",False))
        self.newPageBefore   = bool(raw.get("newPageBefore",False))
        self.newPageAfter    = bool(raw.get("newPageAfter",False))
        self.printAtBottom   = bool(raw.get("printAtBottom",False))
        # Suppress
        self.suppress        = raw.get("suppress", False)
        self.suppressFormula = raw.get("suppressFormula", "")
        self.suppressBlank   = bool(raw.get("suppressBlank", False))
        # Style
        self.bgColor = raw.get("bgColor","transparent") or "transparent"

    @property
    def is_iterable(self): return bool(self.iterates)
    def __repr__(self):    return f"<Section {self.id!r} {self.stype} h={self.height}>"


class Element:
    def __init__(self, raw:dict):
        self.id        = raw.get("id","")
        self.type      = raw.get("type","text")
        self.sectionId = raw.get("sectionId","")
        self.x         = int(raw.get("x",0));   self.y = int(raw.get("y",0))
        self.w         = max(1,int(raw.get("w",100))); self.h = max(1,int(raw.get("h",14)))
        self.fontFamily= raw.get("fontFamily","Arial")
        self.fontSize  = int(raw.get("fontSize",8))
        self.bold      = bool(raw.get("bold",False))
        self.italic    = bool(raw.get("italic",False))
        self.underline = bool(raw.get("underline",False))
        self.align     = raw.get("align","left")
        self.color     = raw.get("color","#000000")
        self.bgColor   = raw.get("bgColor","transparent")
        self.borderColor= raw.get("borderColor","transparent")
        self.borderWidth= int(raw.get("borderWidth",0))
        self.borderStyle= raw.get("borderStyle","solid")
        self.lineDir   = raw.get("lineDir","h")
        self.lineWidth = int(raw.get("lineWidth",1))
        self.zIndex    = int(raw.get("zIndex",0))
        self.content   = raw.get("content","")
        self.fieldPath = raw.get("fieldPath","")
        self.fieldFmt  = raw.get("fieldFmt")
        # Advanced
        self.canGrow   = bool(raw.get("canGrow",False))
        self.canShrink = bool(raw.get("canShrink",False))
        self.wordWrap  = bool(raw.get("wordWrap",False))
        self.suppressIfEmpty = bool(raw.get("suppressIfEmpty",False))
        self.src       = raw.get("src","")
        self.srcFit    = raw.get("srcFit","contain")
        self.conditionalStyles = list(raw.get("conditionalStyles",[]))
        self.visibleIf = raw.get("visibleIf", "")
        self.style     = raw.get("style", "") or raw.get("styleName", "")
        # table/chart/subreport extras
        self.columns   = list(raw.get("columns", []))
        self.chartType = raw.get("chartType", "bar")
        self.layoutPath= raw.get("layoutPath", "")
        self.dataPath  = raw.get("dataPath", "")
        # Chart extras
        self.labelField  = raw.get("labelField", "")
        self.valueField  = raw.get("valueField", "")
        self.showLegend  = bool(raw.get("showLegend", True))
        self.showGrid    = bool(raw.get("showGrid", True))
        # Barcode extras
        self.barcodeType = raw.get("barcodeType", "code128")
        self.showText    = bool(raw.get("showText", True))
        # Crosstab extras
        self.rowField    = raw.get("rowField", "")
        self.colField    = raw.get("colField", "")
        self.summaryField= raw.get("summaryField", "")
        self.summary     = raw.get("summary", "sum")
        # Rich-text extras
        self.htmlContent = raw.get("htmlContent", "")
        # Subreport extras (layoutPath already above)
        self.target      = raw.get("target", "")
        # Note: unknown types are rendered as empty by the engine

    @property
    def is_field(self): return self.type=="field"
    @property
    def is_text(self):  return self.type=="text"
    @property
    def is_line(self):  return self.type=="line"
    @property
    def is_rect(self):  return self.type=="rect"
    @property
    def is_image(self): return self.type=="image"
    def effective_src(self): return self.src or self.content or self.fieldPath or ""
    def __repr__(self): return f"<Element {self.id!r} {self.type} ({self.x},{self.y}) {self.w}x{self.h}>"


def load_layout(path) -> Layout:
    p = Path(path)
    if not p.exists(): raise FileNotFoundError(f"Layout not found: {p}")
    with open(p,encoding="utf-8") as f: return Layout(json.load(f))

def layout_from_dict(raw:dict) -> Layout: return Layout(raw)
def default_invoice_layout() -> Layout:   return Layout(_default_invoice_raw())


def _el(id,tp,sid,x,y,w,h,**kw):
    base=dict(id=id,type=tp,sectionId=sid,x=x,y=y,w=w,h=h,
              fontFamily="Arial",fontSize=8,bold=False,italic=False,underline=False,
              align="left",color="#000000",bgColor="transparent",
              borderColor="transparent",borderWidth=0,borderStyle="solid",
              lineDir="h",lineWidth=1,zIndex=0,content="",fieldPath="",fieldFmt=None)
    base.update(kw); return base


def _default_invoice_raw():
    return {
        "name":"Factura Electrónica — Layout por Defecto","version":"1.0","docType":"factura",
        "pageWidth":754,"pageSize":"A4",
        "margins":{"top":15,"bottom":15,"left":20,"right":20},
        "sections":[
            {"id":"s-rh","stype":"rh","label":"Encabezado del informe","abbr":"EI","height":110},
            {"id":"s-ph","stype":"ph","label":"Encabezado de página","abbr":"EP","height":80},
            {"id":"s-d1","stype":"det","label":"Detalle a","abbr":"D","height":14,"iterates":"items"},
            {"id":"s-pf","stype":"pf","label":"Pie de página","abbr":"PP","height":120},
            {"id":"s-rf","stype":"rf","label":"Resumen del informe","abbr":"RI","height":30},
        ],
        "elements":[
            _el("rh-01","field","s-rh",4,4,380,16,   fieldPath="empresa.razon_social",fontSize=11,bold=True),
            _el("rh-02","field","s-rh",4,22,220,12,  fieldPath="empresa.ruc",fieldFmt="ruc_mask"),
            _el("rh-03","field","s-rh",4,35,380,12,  fieldPath="empresa.direccion_matriz"),
            _el("rh-04","field","s-rh",4,48,340,10,  fieldPath="empresa.obligado_contabilidad",fontSize=7,bold=True),
            _el("rh-rect","rect","s-rh",530,4,220,96, bgColor="transparent",borderColor="#C0511A",borderWidth=2),
            _el("rh-title","text","s-rh",535,8,210,16, content="FACTURA",fontSize=12,bold=True,align="center",color="#C0511A",zIndex=1),
            _el("rh-docnum","field","s-rh",535,28,210,14,fieldPath="fiscal.numero_documento",fontSize=10,bold=True,align="center",zIndex=1),
            _el("rh-amb","field","s-rh",535,45,210,11, fieldPath="fiscal.ambiente",fontSize=8,align="center",color="#856404",zIndex=1),
            _el("rh-date","field","s-rh",535,60,210,11, fieldPath="fiscal.fecha_autorizacion",fieldFmt="datetime",fontSize=7,align="center",zIndex=1),
            _el("rh-clave","field","s-rh",535,74,210,10, fieldPath="fiscal.clave_acceso",fieldFmt="clave_acceso",fontSize=6,align="center",color="#444",fontFamily="Courier New",zIndex=1),
            _el("ph-01","text","s-ph",4,4,60,12,    content="Cliente:",bold=True),
            _el("ph-02","field","s-ph",68,4,380,12,  fieldPath="cliente.razon_social"),
            _el("ph-03","text","s-ph",4,18,60,12,   content="RUC/CI:",bold=True),
            _el("ph-04","field","s-ph",68,18,160,12, fieldPath="cliente.identificacion"),
            _el("ph-05","text","s-ph",4,32,60,12,   content="Dirección:",bold=True),
            _el("ph-06","field","s-ph",68,32,380,12, fieldPath="cliente.direccion"),
            _el("ph-hdr","rect","s-ph",4,62,746,16,  bgColor="#C0511A",borderColor="#A03010",borderWidth=1),
            _el("ph-h1","text","s-ph",6,63,50,14,   content="CÓDIGO",fontSize=7,bold=True,color="#FFF",zIndex=1),
            _el("ph-h2","text","s-ph",60,63,340,14,  content="DESCRIPCIÓN",fontSize=7,bold=True,color="#FFF",zIndex=1),
            _el("ph-h3","text","s-ph",404,63,44,14,  content="CANT.",fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h4","text","s-ph",452,63,70,14,  content="P.UNITARIO",fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h5","text","s-ph",526,63,50,14,  content="DESCUENTO",fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("ph-h6","text","s-ph",580,63,70,14,  content="SUBTOTAL",fontSize=7,bold=True,color="#FFF",align="right",zIndex=1),
            _el("det-01","field","s-d1",4,0,52,14,   fieldPath="item.codigo",fontSize=7),
            _el("det-02","field","s-d1",60,0,340,14,  fieldPath="item.descripcion",fontSize=7),
            _el("det-03","field","s-d1",404,0,44,14,  fieldPath="item.cantidad",fieldFmt="float2",fontSize=7,align="right"),
            _el("det-04","field","s-d1",452,0,70,14,  fieldPath="item.precio_unitario",fieldFmt="currency",fontSize=7,align="right"),
            _el("det-05","field","s-d1",526,0,50,14,  fieldPath="item.descuento",fieldFmt="currency",fontSize=7,align="right"),
            _el("det-06","field","s-d1",580,0,70,14,  fieldPath="item.subtotal",fieldFmt="currency",fontSize=7,align="right",bold=True),
            _el("pf-l1","text","s-pf",440,4,130,12,   content="SUBTOTAL IVA 12%:",fontSize=7,bold=True,align="right"),
            _el("pf-v1","field","s-pf",574,4,70,12,   fieldPath="totales.subtotal_12",fieldFmt="currency",fontSize=7,align="right",bold=True),
            _el("pf-l2","text","s-pf",440,18,130,12,  content="SUBTOTAL IVA 0%:",fontSize=7,bold=True,align="right"),
            _el("pf-v2","field","s-pf",574,18,70,12,  fieldPath="totales.subtotal_0",fieldFmt="currency",fontSize=7,align="right"),
            _el("pf-l3","text","s-pf",440,32,130,12,  content="SUBTOTAL:",fontSize=7,bold=True,align="right"),
            _el("pf-v3","field","s-pf",574,32,70,12,  fieldPath="totales.subtotal_sin_impuestos",fieldFmt="currency",fontSize=7,align="right"),
            _el("pf-sep","line","s-pf",440,47,204,2,  borderColor="#C0511A",borderWidth=1),
            _el("pf-l4","text","s-pf",440,51,130,14,  content="IVA 12%:",fontSize=8,bold=True,align="right"),
            _el("pf-v4","field","s-pf",574,51,70,14,  fieldPath="totales.iva_12",fieldFmt="currency",fontSize=8,align="right"),
            _el("pf-sep2","line","s-pf",440,67,204,2, borderColor="#333",borderWidth=1),
            _el("pf-l5","text","s-pf",440,71,130,16,  content="VALOR TOTAL:",fontSize=10,bold=True,align="right",color="#C0511A"),
            _el("pf-v5","field","s-pf",574,71,70,16,  fieldPath="totales.importe_total",fieldFmt="currency",fontSize=10,align="right",bold=True,color="#C0511A"),
            _el("rf-line","line","s-rf",4,4,746,1,   borderColor="#CCC",borderWidth=1),
            _el("rf-txt","text","s-rf",4,8,450,12,   content="Documento generado electrónicamente · ReportForge",fontSize=7,color="#666"),
            _el("rf-doc","field","s-rf",500,8,100,12, fieldPath="meta.doc_num",fontSize=7,color="#666",align="right"),
        ],
    }


# Add convenience method
def _sections_of_type(self, stype: str) -> list:
    return [s for s in self.sections if s.stype == stype]
Layout.sections_of_type = _sections_of_type
