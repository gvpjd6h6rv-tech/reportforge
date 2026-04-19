from __future__ import annotations

from pathlib import Path
from typing import Any

from ..expressions.aggregator import Aggregator
from ..expressions.evaluator import ExpressionEvaluator
from ..expressions.running_totals import RunningTotals
from ..features.parameters import Parameters
from ..pipeline.normalizer import normalize_layout
from ..resolvers.field_resolver import FieldResolver
from ..resolvers.layout_loader import layout_from_dict
from ..styles import DEFAULT_REGISTRY, StyleRegistry
from .enterprise_engine_data import (
    resolve_data,
    render_enterprise as _render_enterprise,
    render_preview as _render_preview,
)
from .enterprise_engine_layout import (
    build_body_rows,
    build_css,
    build_page,
    build_pages,
    build_row,
    build_row_h,
    build_section,
    build_secs,
    build_secs_group,
    build_static,
    build_visible,
)
from .enterprise_engine_shared import _coerce_str, _esc, _placeholder_el, _sk


class EnterpriseEngine:
    """
    ReportForge Enterprise HTML Engine.
    Drop-in replacement for AdvancedHtmlEngine with full feature set.
    """

    def __init__(self, layout_raw: dict, data: Any, *,
                 debug: bool = False,
                 params: dict = None,
                 styles: dict = None,
                 datasets: dict = None,
                 preview: bool = False,
                 layout_path: Path = None):
        self._debug = debug
        self._preview = preview
        self._param_defs = layout_raw.get("parameters", []) if isinstance(layout_raw, dict) else []
        self._param_ctx = Parameters(self._param_defs, params or {})
        self._params = self._param_ctx.all()
        self._layout_path = layout_path
        self._style_reg = StyleRegistry(styles) if styles else DEFAULT_REGISTRY

        norm = normalize_layout(layout_raw)
        self._norm = norm
        self._layout = layout_from_dict(norm)
        self._data = self._param_ctx.inject_into_data(resolve_data(data, datasets))
        self._items = list(self._data.get("items", []))
        for sr in reversed(norm.get("sortBy", [])):
            f = sr["field"]
            self._items.sort(key=lambda it: _sk(it.get(f, "")), reverse=sr.get("desc", False))

        self._rt = RunningTotals()
        self._resolver = FieldResolver(self._data)
        self._ev = ExpressionEvaluator(self._items, self._params, self._rt)
        self._agg = Aggregator(self._items)
        self._groups = norm.get("groups", [])

        m = self._layout.margin_mm
        self._page_h = norm.get("pageHeight", 1123)
        self._mtop = int(m["top"] * 3.7795)
        self._mbot = int(m["bottom"] * 3.7795)

    def render(self) -> str:
        css = self._css()
        title = _esc(self._layout.name)
        body = self._pages()
        return (
            f"<!DOCTYPE html>\n<html lang='es'>\n<head>"
            f"<meta charset='UTF-8'><title>{title}</title>"
            f"<style>{css}</style></head>"
            f"\n<body>\n{body}\n</body></html>"
        )

    def render_preview(self) -> str:
        self._preview = True
        css = self._css()
        body = self._pages()
        return (
            f"<!DOCTYPE html>\n<html lang='es'>\n<head>"
            f"<meta charset='UTF-8'><title>Preview</title>"
            f"<style>{css}</style></head>"
            f"\n<body>\n{body}\n</body></html>"
        )

    def _css(self) -> str:
        return build_css(self)

    def _pages(self) -> str:
        return build_pages(self)

    def _body_rows(self):
        return build_body_rows(self)

    def _page(self, rows, first: bool, last: bool):
        return build_page(self, rows, first, last)

    def _row(self, row: dict):
        return build_row(self, row)

    def _static(self, s):
        return build_static(self, s)

    def _sec(self, s, res, agg):
        return build_section(self, s, res, agg)

    def _visible(self, section, res):
        return build_visible(self, section, res)

    def _visible_el(self, el, res):
        expr = getattr(el, "visibleIf", "") or ""
        if not expr:
            return True
        try:
            return bool(self._ev.eval_expr(expr, res))
        except Exception:
            return True

    def _secs(self, stype: str):
        return build_secs(self, stype)

    def _secs_group(self, stype: str, gi: int):
        return build_secs_group(self, stype, gi)

    def _resolve_data(self, data: Any, datasets: dict = None) -> dict:
        return resolve_data(data, datasets)


def render_enterprise(layout_raw, data, output_path=None, **kw) -> str:
    return _render_enterprise(layout_raw, data, output_path=output_path, **kw)


def render_preview(layout_raw, data, **kw) -> str:
    return _render_preview(layout_raw, data, **kw)


EnterpriseHtmlEngine = EnterpriseEngine

__all__ = [
    "EnterpriseEngine",
    "EnterpriseHtmlEngine",
    "render_enterprise",
    "render_preview",
]
