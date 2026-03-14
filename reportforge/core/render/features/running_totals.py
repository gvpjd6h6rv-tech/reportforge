# core/render/features/running_totals.py
from __future__ import annotations
import re


class RunningTotals:
    """
    Accumulates running sums and counts across detail rows.
    API expected by test suite:
      .update(item, group_value=None)
      .snapshot(expr) -> (handled, value)
      .reset_group(new_group)
      .reset_report()
    """
    _RSUM = re.compile(r'^runningSum\((\w+)\)$')
    _RCNT = re.compile(r'^runningCount\(\)$')
    _RGRP = re.compile(r'^runningGroupCount\(\)$')

    def __init__(self):
        self._sums:    dict[str, float] = {}
        self._counts:  dict[str, int]   = {}
        self._g_sums:  dict[str, float] = {}
        self._g_counts:dict[str, int]   = {}
        self._g_count:  int             = 0
        self._total_count: int          = 0
        self._cur_group = None

    def update(self, item: dict, group_value=None) -> None:
        if group_value is not None and group_value != self._cur_group:
            self.reset_group(group_value)
        for k, v in item.items():
            try:
                fv = float(v) if not isinstance(v, (int, float, bool)) else float(v)
                if isinstance(v, bool): raise TypeError
                self._sums[k]   = self._sums.get(k, 0.0)   + fv
                self._g_sums[k] = self._g_sums.get(k, 0.0) + fv
            except (TypeError, ValueError):
                pass
            self._counts[k]   = self._counts.get(k, 0) + 1
            self._g_counts[k] = self._g_counts.get(k, 0) + 1
        self._total_count += 1
        self._g_count     += 1

    def snapshot(self, expr: str) -> tuple[bool, any]:
        """Return (handled, value) for a runningXxx() expression."""
        m = self._RSUM.match(expr.strip())
        if m:
            field = m.group(1)
            return True, self._sums.get(field, 0.0)
        if self._RCNT.match(expr.strip()):
            return True, self._total_count
        if self._RGRP.match(expr.strip()):
            return True, self._g_count
        return False, None

    def running_sum(self, field: str, group_scope: bool = False) -> float:
        field = field.rsplit(".", 1)[-1]
        return (self._g_sums if group_scope else self._sums).get(field, 0.0)

    def running_count(self, field: str = "", group_scope: bool = False) -> int:
        if not field:
            return self._g_count if group_scope else self._total_count
        field = field.rsplit(".", 1)[-1]
        return (self._g_counts if group_scope else self._counts).get(field, 0)

    def reset_group(self, new_group=None) -> None:
        self._g_sums.clear()
        self._g_counts.clear()
        self._g_count = 0
        self._cur_group = new_group

    def reset_report(self) -> None:
        self._sums.clear(); self._counts.clear()
        self._g_sums.clear(); self._g_counts.clear()
        self._g_count = 0; self._total_count = 0; self._cur_group = None
