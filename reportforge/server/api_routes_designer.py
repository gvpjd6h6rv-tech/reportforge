from __future__ import annotations

import re as _re

from .api_contracts import FormulaValidateRequest, BarcodePreviewRequest, HTTPException, Response
from .api_helpers import _validate


def register_designer_routes(app, cache):
    @app.post("/validate", tags=["Designer"], summary="Validate a layout JSON and return warnings")
    async def _post_validate_layout(layout: dict):
        warnings = _validate(layout)
        return {"valid": len(warnings) == 0, "warnings": warnings}

    @app.post("/validate-formula", tags=["Designer"], summary="Validate and test-evaluate a CR formula expression")
    async def _post_validate_formula(req: FormulaValidateRequest):
        from reportforge.core.render.expressions.evaluator import ExpressionEvaluator
        from reportforge.core.render.expressions.cr_functions import is_cr_function
        from reportforge.core.render.resolvers.field_resolver import FieldResolver

        errors: list[str] = []
        suggestions: list[str] = []
        result = None
        formula = req.formula.strip()
        if not formula:
            return {"valid": False, "errors": ["Formula is empty"], "result": None, "suggestions": []}

        depth = 0
        for ch in formula:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            if depth < 0:
                errors.append("Unmatched closing parenthesis ')'")
                break
        if depth > 0:
            errors.append(f"Unclosed parenthesis — {depth} '(' without matching ')'")

        brace_depth = 0
        for ch in formula:
            if ch == "{":
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
            if brace_depth < 0:
                errors.append("Unmatched closing brace '}'")
                break
        if brace_depth > 0:
            errors.append("Unclosed field reference '{' — missing '}'")

        fn_names = _re.findall(r'\b([a-zA-Z_]\w*)\s*\(', formula)
        _KNOWN_BUILTINS = {"sum", "count", "avg", "min", "max", "first", "last", "runningsum", "runningcount", "if", "iif", "choose", "switch", "inrange", "inlist"}
        for fn in fn_names:
            fn_l = fn.lower()
            if not is_cr_function(fn_l) and fn_l not in _KNOWN_BUILTINS:
                errors.append(f"Unknown function: '{fn}' — check spelling or CR function reference")
                suggestions.append("Did you mean one of: DateAdd, ToText, InStr, Left, Mid, IIF?")

        if not errors and req.sample:
            try:
                items = [req.sample]
                ev = ExpressionEvaluator(items)
                sample_data = {"items": items, **req.sample}
                res = FieldResolver(sample_data).with_item(req.sample)
                result = str(ev.eval_expr(formula, res))
            except Exception as exc:
                errors.append(f"Evaluation error: {exc}")

        field_refs = _re.findall(r'\{([^{}]+)\}', formula)
        known_fields = set(req.fields)
        for ref in field_refs:
            if known_fields and ref not in known_fields:
                close = [f for f in known_fields if f.split(".")[-1] == ref.split(".")[-1]]
                if close:
                    suggestions.append(f"Field '{{{{ {ref} }}}}' not in schema — did you mean '{{{close[0]}}}'?")

        return {"valid": len(errors) == 0, "errors": errors, "result": result, "suggestions": suggestions, "fieldRefs": field_refs, "functions": list(set(fn_names))}

    @app.post("/preview-barcode", tags=["Designer"], summary="Render barcode value → SVG")
    @app.get("/preview-barcode", tags=["Designer"], summary="Render barcode value → SVG (GET)")
    async def _get_barcode(value: str = "RF-001", barcodeType: str = "code128", width: int = 200, height: int = 80, showText: bool = True):
        from reportforge.core.render.engines.advanced_engine import _render_barcode_svg
        svg = _render_barcode_svg(value, barcodeType.lower(), width, height, showText)
        return Response(content=svg, media_type="image/svg+xml")

    @app.post("/preview-barcode/body", tags=["Designer"], summary="Render barcode from JSON body → SVG")
    async def _post_barcode(req: BarcodePreviewRequest):
        from reportforge.core.render.engines.advanced_engine import _render_barcode_svg
        svg = _render_barcode_svg(req.value, req.barcodeType.lower(), req.width, req.height, req.showText)
        return Response(content=svg, media_type="image/svg+xml")
