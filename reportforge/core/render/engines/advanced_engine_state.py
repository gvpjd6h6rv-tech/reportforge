from __future__ import annotations

import datetime

from ..pipeline.normalizer import normalize_layout
from ..resolvers.field_resolver import FieldResolver
from ..resolvers.layout_loader import layout_from_dict
from ..expressions.aggregator import Aggregator
from ..expressions.evaluator import ExpressionEvaluator
from .advanced_engine_shared import _ROW_EVEN, _ROW_ODD, _esc, _sk


class AdvancedEngineState:
    def __init__(self, layout_raw, data, debug=False, alt_colors=True):
        self._data = data
        self._debug = debug
        norm = normalize_layout(layout_raw)
        self._layout = layout_from_dict(norm)
        self._norm = norm
        self._items = list(data.get("items", []))
        for sr in reversed(norm.get("sortBy", [])):
            field = sr["field"]
            self._items.sort(key=lambda it: _sk(it.get(field, "")), reverse=sr.get("desc", False))
        self._resolver = FieldResolver(data)
        self._ev = ExpressionEvaluator(self._items)
        self._agg = Aggregator(self._items)
        self._groups = norm.get("groups", [])
        margins = self._layout.margin_mm
        self._page_h = norm.get("pageHeight", 1123)
        self._mtop = int(margins["top"] * 3.7795)
        self._mbot = int(margins["bottom"] * 3.7795)
        self._print_date = datetime.date.today().strftime("%d/%m/%Y")
        self._print_time = datetime.datetime.now().strftime("%H:%M:%S")

    def _css(self) -> str:
        margins = self._layout.margin_mm
        page_width = self._layout.page_width
        dbg = ".cr-section,.cr-detail-row{outline:1px dashed rgba(255,0,0,.15)}" if self._debug else ""
        page_shadow = ".rpt-page{box-shadow:0 2px 8px rgba(0,0,0,.15);margin:10px auto;}" if getattr(self, "_preview", False) else ""
        page_rule = "" if getattr(self, "_preview", False) else (
            f"@page{{size: {self._norm.get('pageSize','A4')} {self._norm.get('orientation','portrait')};"
            f"margin:{margins['top']}mm {margins['right']}mm {margins['bottom']}mm {margins['left']}mm;"
            f"@bottom-center{{content:'Página 'counter(page)' de 'counter(pages);"
            f"font-family:Arial,sans-serif;font-size:7pt;color:#888}}}}"
        )
        return (
            f"{page_rule}"
            f"*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}"
            f"body{{font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#000;background:#fff}}"
            f".rpt-page{{width:{page_width}px;position:relative;page-break-after:always}}"
            f".rpt-page:last-child{{page-break-after:auto}}"
            f".cr-section{{position:relative;width:{page_width}px;overflow:hidden;page-break-inside:avoid}}"
            f".cr-section.keep-together{{page-break-inside:avoid}}"
            f".cr-section.break-before{{page-break-before:always}}"
            f".cr-section.break-after{{page-break-after:always}}"
            f".cr-detail-row{{position:relative;width:{page_width}px;overflow:hidden;page-break-inside:avoid}}"
            f".cr-el{{position:absolute;overflow:hidden;display:flex;padding:0 2px}}"
            f".cr-el-inner{{overflow:hidden;flex:1;min-width:0}}"
            f".wrap .cr-el-inner{{white-space:pre-wrap;word-break:break-word}}"
            f".nowrap .cr-el-inner{{white-space:nowrap;text-overflow:ellipsis}}"
            f"{dbg}"
            f"{page_shadow}"
        )
