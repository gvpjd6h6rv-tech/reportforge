from __future__ import annotations

from typing import Any


def resolve_field(evaluator, path: str) -> Any:
    if not path:
        return None
    parts = path.split(".")
    if parts[0] in evaluator._record:
        val = evaluator._record[parts[0]]
        for p in parts[1:]:
            if isinstance(val, dict):
                val = val.get(p)
            else:
                val = None
                break
        return val
    if path in evaluator._record:
        return evaluator._record[path]
    if parts[0] == "param" and len(parts) > 1:
        return evaluator._params.get(".".join(parts[1:]))
    return None


def special_field(evaluator, name: str) -> Any:
    return {
        "pagenumber": evaluator._page_number,
        "totalpages": evaluator._total_pages,
        "recordnumber": evaluator._record_number,
        "printdate": evaluator._print_date,
        "printtime": evaluator._print_time,
        "true": True,
        "false": False,
    }.get(name)
