from __future__ import annotations

import re

from reportforge.core.render.expressions.cr_functions import is_cr_function
from reportforge_server_http_utils import _json, _error


def _post_validate_layout(handler, body: dict):
    layout = body if "sections" in body else body.get("layout", body)
    warnings = _validate_layout(layout)
    _json(handler, {"valid": len(warnings) == 0, "warnings": warnings})


def _post_validate_formula(handler, body: dict):
    formula = str(body.get("formula", "")).strip()
    sample = body.get("sample") or {}
    errors: list = []
    suggestions: list = []
    result = None

    if not formula:
        _json(handler, {"valid": False, "errors": ["Formula is empty"], "result": None, "suggestions": []})
        return

    depth = 0
    for ch in formula:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
    if depth != 0:
        errors.append("Unbalanced parentheses")

    brace_depth = 0
    for ch in formula:
        if ch == "{":
            brace_depth += 1
        elif ch == "}":
            brace_depth -= 1
    if brace_depth != 0:
        errors.append("Unbalanced field reference braces")

    fn_names = re.findall(r"\b([a-zA-Z_]\w*)\s*\(", formula)
    known = {
        "sum", "count", "avg", "min", "max", "first", "last", "runningsum", "runningcount",
        "if", "iif", "choose", "switch", "inrange", "inlist", "previous", "next",
        "today", "now", "currentdate", "currentdatetime", "timer",
        "whilereadingrecords", "whileprintingrecords", "in", "between", "not", "and", "or",
        "pagenumber", "totalpages", "recordnumber", "reportname", "true", "false", "null",
    }
    for fn in fn_names:
        if not is_cr_function(fn.lower()) and fn.lower() not in known:
            errors.append(f"Unknown function: '{fn}'")
            suggestions.append("Check Crystal Reports function reference")

    if not errors and sample:
        try:
            from reportforge.core.render.expressions.evaluator import ExpressionEvaluator
            from reportforge.core.render.resolvers.field_resolver import FieldResolver

            items = [sample]
            ev = ExpressionEvaluator(items)
            res = FieldResolver({"items": items, **sample}).with_item(sample)
            result = str(ev.eval_expr(formula, res))
        except Exception as exc:
            errors.append(f"Evaluation error: {exc}")

    field_refs = re.findall(r"\{([^{}]+)\}", formula)
    _json(handler, {"valid": len(errors) == 0, "errors": errors, "result": result, "suggestions": suggestions, "fieldRefs": field_refs, "functions": list(set(fn_names))})


def _validate_layout(layout: dict) -> list[dict]:
    warnings = []
    w = lambda level, msg: warnings.append({"level": level, "message": msg})
    if not layout.get("sections"):
        w("error", "Layout has no sections defined")
    if not layout.get("elements"):
        w("warning", "Layout has no elements — report will be blank")
    if not layout.get("name"):
        w("info", "Layout has no name")
    section_ids = {s.get("id") for s in layout.get("sections", [])}
    pw = layout.get("pageWidth", 794)
    for el in layout.get("elements", []):
        if el.get("sectionId") not in section_ids:
            w("error", f"Element '{el.get('id','')}' references non-existent sectionId")
        if el.get("type") == "field" and not el.get("fieldPath"):
            w("warning", f"Field element '{el.get('id','')}' has no fieldPath")
        if el.get("w", 0) <= 0 or el.get("h", 0) <= 0:
            w("error", f"Element '{el.get('id','')}' has zero/negative dimensions")
        if el.get("x", 0) + el.get("w", 0) > pw:
            w("warning", f"Element '{el.get('id','')}' overflows page width")
    return warnings
