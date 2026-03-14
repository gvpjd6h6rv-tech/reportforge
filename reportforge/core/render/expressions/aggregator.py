# core/render/expressions/aggregator.py
from __future__ import annotations
from typing import Any

class Aggregator:
    def __init__(self, items: list[dict]):
        self._items = items
    def sum(self, path: str) -> float:
        return sum(self._nums(path))
    def count(self, path: str = "items") -> int:
        field = self._field(path)
        if not field or field == "items": return len(self._items)
        return sum(1 for it in self._items if self._get(it,field) not in ("",None))
    def avg(self, path: str) -> float:
        vals = self._nums(path); return sum(vals)/len(vals) if vals else 0.0
    def min(self, path: str) -> Any:
        vals = self._nums(path); return min(vals) if vals else 0
    def max(self, path: str) -> Any:
        vals = self._nums(path); return max(vals) if vals else 0
    def first(self, path: str) -> Any:
        return self._get(self._items[0], self._field(path)) if self._items else ""
    def last(self, path: str) -> Any:
        return self._get(self._items[-1], self._field(path)) if self._items else ""
    def group_sum(self, group_items, field):
        return sum(self._to_num(self._get(it,field)) for it in group_items)
    def group_count(self, group_items): return len(group_items)
    def group_avg(self, group_items, field):
        vals=[self._to_num(self._get(it,field)) for it in group_items if self._get(it,field) not in ("",None)]
        return sum(vals)/len(vals) if vals else 0.0
    def _field(self, path):
        return path.split(".",1)[1] if "." in path else path
    def _get(self, item, field):
        if not field or field=="items": return item
        current=item
        for k in field.split("."):
            if isinstance(current,dict): current=current.get(k)
            else: return None
        return current
    def _to_num(self, val):
        if val is None or val=="": return 0.0
        try: return float(val)
        except: return 0.0
    def _nums(self, path):
        field=self._field(path)
        return [self._to_num(self._get(it,field)) for it in self._items if self._get(it,field) not in ("",None)]
    def __repr__(self): return f"<Aggregator n={len(self._items)}>"
