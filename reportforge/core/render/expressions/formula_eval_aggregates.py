from __future__ import annotations

from typing import Any

from .type_coercion import to_num


def agg_items(evaluator, args: list) -> tuple:
    if not args:
        return (None, evaluator._group_items or evaluator._all_records)
    if isinstance(args[0], str):
        field = args[0]
        items = evaluator._group_items if len(args) < 2 else evaluator._all_records
        return (field, items)
    return (None, args)


def agg_sum(evaluator, args: list) -> float:
    field, items = agg_items(evaluator, args)
    if field:
        return sum(to_num(r.get(field, 0)) for r in items if r.get(field) is not None)
    return sum(to_num(v) for v in items)


def agg_avg(evaluator, args: list) -> float:
    field, items = agg_items(evaluator, args)
    if field:
        vals = [to_num(r.get(field, 0)) for r in items if r.get(field) is not None]
    else:
        vals = [to_num(v) for v in items]
    return sum(vals) / len(vals) if vals else 0


def agg_count(evaluator, args: list) -> int:
    field, items = agg_items(evaluator, args)
    if field:
        return sum(1 for r in items if r.get(field) is not None)
    return len(items)


def agg_max(evaluator, args: list) -> Any:
    field, items = agg_items(evaluator, args)
    vals = [r.get(field) for r in items if r.get(field) is not None] if field else items
    return max(vals) if vals else None


def agg_min(evaluator, args: list) -> Any:
    field, items = agg_items(evaluator, args)
    vals = [r.get(field) for r in items if r.get(field) is not None] if field else items
    return min(vals) if vals else None


def agg_distinct_count(evaluator, args: list) -> int:
    field, items = agg_items(evaluator, args)
    if field:
        return len(set(r.get(field) for r in items if r.get(field) is not None))
    return len(set(str(v) for v in items))
