# core/render/pipeline/normalizer.py
# Converts designer JSON (any field naming convention) to canonical renderer format.
from __future__ import annotations
import copy
from typing import Any

_PAGE_MM = {"A4":(210,297),"A3":(297,420),"Letter":(215.9,279.4),"Legal":(215.9,355.6)}
_MM2PX = 3.7795

_STYPE = {"report_header":"rh","page_header":"ph","group_header":"gh","detail":"det",
          "group_footer":"gf","page_footer":"pf","report_footer":"rf",
          "rh":"rh","ph":"ph","gh":"gh","det":"det","gf":"gf","pf":"pf","rf":"rf",
          "header":"rh","footer":"pf","body":"det","data":"det"}

_ETYPE = {"text":"text","label":"text","statictext":"text","field":"field",
          "data":"field","datafield":"field","line":"line","hline":"line",
          "vline":"line","rect":"rect","rectangle":"rect","box":"rect",
          "image":"image","picture":"image","img":"image",
          # Phase 2 element types — passed through as-is
          "chart":"chart","table":"table","subreport":"subreport",
          "barcode":"barcode","crosstab":"crosstab","richtext":"richtext"}

def normalize_layout(raw: dict) -> dict:
    raw = copy.deepcopy(raw)
    out: dict[str, Any] = {}
    out["name"]      = _p(raw,"name","title","reportName") or "Untitled"
    out["version"]   = str(_p(raw,"version") or "1.0")
    page  = _p(raw,"pageSize","page_size","paper") or "A4"
    orient= (_p(raw,"orientation","orient") or "portrait").lower()
    out["pageSize"]    = page
    out["orientation"] = orient
    w_mm, h_mm = _PAGE_MM.get(page, (210,297))
    if orient == "landscape": w_mm, h_mm = h_mm, w_mm
    out["pageWidth"]  = int(_p(raw,"pageWidth","page_width","width")  or int(w_mm*_MM2PX))
    out["pageHeight"] = int(_p(raw,"pageHeight","page_height","height") or round(h_mm*_MM2PX))
    rm = _p(raw,"margins","margin")
    if isinstance(rm,dict):
        out["margins"]={k:_n(rm.get(k,15 if k in("top","bottom") else 20)) for k in("top","bottom","left","right")}
    elif isinstance(rm,(int,float)):
        m=_n(rm); out["margins"]={"top":m,"bottom":m,"left":m,"right":m}
    else:
        out["margins"]={"top":15,"bottom":15,"left":20,"right":20}
    out["groups"]   = _norm_groups(_p(raw,"groups","groupBy") or [])
    out["sortBy"]   = _norm_sort(_p(raw,"sortBy","sort") or [])
    out["title"]    = _p(raw,"title","reportTitle") or out["name"]
    out["sections"] = [_norm_sec(s,i) for i,s in enumerate(_p(raw,"sections","bands") or [])]
    out["elements"] = [e for r in (_p(raw,"elements","fields","objects") or [])
                       for e in [_norm_el(r)] if e]
    out["_normalized"] = True
    return out

def _norm_sec(raw,idx):
    stype_raw = str(_p(raw,"stype","type","sectionType","bandType") or "det").lower()
    stype = _STYPE.get(stype_raw,"det")
    iterates = _p(raw,"iterates","dataSource","source","iterateOver")
    if iterates is None and stype=="det": iterates="items"
    return {
        "id":              str(_p(raw,"id","sectionId") or f"s-{idx}"),
        "stype":           stype,
        "label":           str(_p(raw,"label","name","title") or stype),
        "abbr":            str(_p(raw,"abbr") or stype[:2].upper()),
        "height":          max(10,int(_p(raw,"height","h") or 20)),
        "iterates":        iterates,
        "groupIndex":      int(_p(raw,"groupIndex","group","groupLevel") or 0),
        "repeatOnNewPage": bool(_p(raw,"repeatOnNewPage","repeat","repeatHeader")),
        "pageBreakBefore": bool(_p(raw,"pageBreakBefore","forceNewPage")),
        "pageBreakAfter":  bool(_p(raw,"pageBreakAfter")),
        "canGrow":         bool(_p(raw,"canGrow","growable")),
        "canShrink":       bool(_p(raw,"canShrink","shrinkable")),
        "bgColor":         _p(raw,"bgColor","backgroundColor") or "transparent",
        "suppress":        _p(raw,"suppress","hidden","isHidden") or False,
        "suppressFormula": str(_p(raw,"suppressFormula","suppress_formula","hideFormula") or ""),
        "suppressBlank":   bool(_p(raw,"suppressBlank","suppress_blank","hideBlank")),
        "newPageBefore":   bool(_p(raw,"newPageBefore","pageBreakBefore","forceNewPage")),
        "newPageAfter":    bool(_p(raw,"newPageAfter","pageBreakAfter")),
        "keepTogether":    bool(_p(raw,"keepTogether","keep_together")),
    }

def _norm_el(raw):
    etype = _ETYPE.get(str(_p(raw,"type","elementType","kind") or "text").lower())
    if not etype: return None
    return {
        "id":               str(_p(raw,"id","elementId") or ""),
        "sectionId":        str(_p(raw,"sectionId","section","bandId") or ""),
        "type":             etype,
        "x":                int(_p(raw,"x","left") or 0),
        "y":                int(_p(raw,"y","top") or 0),
        "w":                max(1,int(_p(raw,"w","width") or 100)),
        "h":                max(1,int(_p(raw,"h","height") or 14)),
        "fontFamily":       str(_p(raw,"fontFamily","font","fontName") or "Arial"),
        "fontSize":         int(_p(raw,"fontSize","size","textSize") or 8),
        "bold":             bool(_p(raw,"bold","fontBold","isBold")),
        "italic":           bool(_p(raw,"italic","fontItalic")),
        "underline":        bool(_p(raw,"underline","fontUnderline")),
        "align":            {"center":"center","right":"right","justify":"justify"}.get(str(_p(raw,"align","textAlign","halign") or "").lower(),"left"),
        "color":            _p(raw,"color","textColor","foreColor") or "#000000",
        "bgColor":          _p(raw,"bgColor","backgroundColor") or "transparent",
        "borderColor":      _p(raw,"borderColor","border_color") or "transparent",
        "borderWidth":      int(_p(raw,"borderWidth","borderSize") or 0),
        "borderStyle":      _p(raw,"borderStyle","border_style") or "solid",
        "lineDir":          "v" if str(_p(raw,"lineDir","direction") or "h").lower() in("v","vertical","vert") else "h",
        "lineWidth":        int(_p(raw,"lineWidth","strokeWidth") or 1),
        "zIndex":           int(_p(raw,"zIndex","z","layer") or 0),
        "content":          str(_p(raw,"content","text","label","caption") or ""),
        "fieldPath":        str(_p(raw,"fieldPath","field","dataField","source","path") or ""),
        "fieldFmt":         _p(raw,"fieldFmt","format","fmt","formatString"),
        "canGrow":          bool(_p(raw,"canGrow","grow","autoHeight")),
        "canShrink":        bool(_p(raw,"canShrink","shrink")),
        "wordWrap":         bool(_p(raw,"wordWrap","wrap","wrapText")),
        "src":              str(_p(raw,"src","source","imageSrc","url") or ""),
        "srcFit":           str(_p(raw,"srcFit","fit","objectFit") or "contain"),
        "conditionalStyles":_p(raw,"conditionalStyles","conditions","highlight") or [],
        "suppressIfEmpty":  bool(_p(raw,"suppressIfEmpty","hideIfEmpty","suppress")),
        # Enterprise fields (preserved as-is)
        "visibleIf":        str(_p(raw,"visibleIf","visible_if","showIf") or ""),
        "style":            str(_p(raw,"style","styleName","namedStyle") or ""),
        "columns":          _p(raw,"columns","cols") or [],
        "chartType":        str(_p(raw,"chartType","chart_type") or "bar"),
        "layoutPath":       str(_p(raw,"layoutPath","layout_path","subreportPath") or ""),
        "dataPath":         str(_p(raw,"dataPath","data_path") or ""),
        # Barcode
        "barcodeType":      str(_p(raw,"barcodeType","barcode_type","symbology") or "code128"),
        "showText":         bool(_p(raw,"showText","show_text","displayText") if _p(raw,"showText","show_text","displayText") is not None else True),
        # Crosstab
        "rowField":         str(_p(raw,"rowField","row_field") or ""),
        "colField":         str(_p(raw,"colField","col_field","columnField") or ""),
        "summaryField":     str(_p(raw,"summaryField","summary_field","valueField","value_field") or ""),
        "summary":          str(_p(raw,"summary","summaryFn","aggregation") or "sum"),
        # Richtext
        "htmlContent":      str(_p(raw,"htmlContent","html_content","rtfContent") or ""),
        # Chart extras
        "labelField":       str(_p(raw,"labelField","label_field","xField") or ""),
        "valueField":       str(_p(raw,"valueField","value_field","yField") or ""),
        "showLegend":       bool(_p(raw,"showLegend") if _p(raw,"showLegend") is not None else True),
        "showGrid":         bool(_p(raw,"showGrid") if _p(raw,"showGrid") is not None else True),
        # Subreport extras
        "target":           str(_p(raw,"target","subreportName") or ""),
    }

def _norm_groups(raw):
    if isinstance(raw,str): return [{"field":raw,"sortDesc":False,"label":""}]
    if isinstance(raw,list):
        out=[]
        for g in raw:
            if isinstance(g,str): out.append({"field":g,"sortDesc":False,"label":""})
            elif isinstance(g,dict): out.append({"field":str(g.get("field",g.get("groupBy",""))),"sortDesc":bool(g.get("sortDesc",g.get("desc",False))),"label":str(g.get("label",""))})
        return out
    return []

def _norm_sort(raw):
    if isinstance(raw,str): return [{"field":raw,"desc":False}]
    if isinstance(raw,list):
        out=[]
        for s in raw:
            if isinstance(s,str): out.append({"field":s,"desc":False})
            elif isinstance(s,dict): out.append({"field":str(s.get("field","")),"desc":bool(s.get("desc",s.get("descending",False)))})
        return out
    return []

def _p(d,*keys):
    for k in keys:
        if k in d and d[k] is not None: return d[k]
    return None

def _n(val,default=0):
    try: return float(val)
    except: return default
