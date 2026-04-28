from __future__ import annotations

import datetime
from typing import Any, Dict, Optional, List

from .formula_ast import EvalTiming
from .formula_parser import parse_formula
from .formula_eval_nodes import eval_node as _eval_node_dispatch

# Lazy import — logger is optional; never crashes if absent.
try:
    from .coercion_logger import coercion_logger as _logger
except Exception:  # pragma: no cover
    _logger = None  # type: ignore[assignment]


class FormulaError(Exception):
    pass


class FormulaEvaluator:
    def __init__(self):
        self._global: Dict[str, Any] = {}
        self._shared: Dict[str, Any] = {}
        self._record: Dict[str, Any] = {}
        self._all_records: List[Dict] = []
        self._record_number: int = 0
        self._group_items: List[Dict] = []
        self._page_number: int = 1
        self._total_pages: int = 1
        self._print_date: str = datetime.date.today().strftime("%d/%m/%Y")
        self._print_time: str = datetime.datetime.now().strftime("%H:%M:%S")
        self._params: Dict[str, Any] = {}
        self._formulas: Dict[str, dict] = {}
        self._agg_cache: Dict[str, Any] = {}

    def set_records(self, records: List[Dict]):
        self._all_records = records
        self._agg_cache.clear()

    def set_record(self, record: Dict, number: int = 0):
        self._record = record
        self._record_number = number

    def set_group(self, items: List[Dict]):
        self._group_items = items

    def set_params(self, params: Dict[str, Any]):
        self._params = params

    def set_page(self, page: int, total: int):
        self._page_number = page
        self._total_pages = total

    def register_formula(self, name: str, expr: str, timing: EvalTiming = EvalTiming.WHILE_READING):
        try:
            ast = parse_formula(expr)
            self._formulas[name] = {"ast": ast, "timing": timing, "src": expr}
        except Exception as e:
            self._formulas[name] = {"ast": None, "timing": timing, "src": expr, "error": str(e)}

    def eval(self, expr_or_name: str, local_vars: Optional[Dict] = None) -> Any:
        local: Dict[str, Any] = local_vars or {}
        if expr_or_name in self._formulas:
            entry = self._formulas[expr_or_name]
            if entry.get("ast") is None:
                return ""
            return self._eval_node(entry["ast"], local)
        try:
            ast = parse_formula(expr_or_name)
            return self._eval_node(ast, local)
        except Exception:
            if _logger is not None:
                _logger.record_mismatch(
                    value=expr_or_name[:200], expected_type="formula",
                    result="", field=expr_or_name[:80],
                )
            return ""

    def eval_formula(self, formula_text: str) -> Any:
        try:
            ast = parse_formula(formula_text)
            return self._eval_node(ast, {})
        except Exception:
            if _logger is not None:
                _logger.record_mismatch(
                    value=formula_text[:200], expected_type="formula",
                    result="", field=formula_text[:80],
                )
            return ""

    def _eval_node(self, node: Any, local: Dict) -> Any:
        return _eval_node_dispatch(self, node, local)
