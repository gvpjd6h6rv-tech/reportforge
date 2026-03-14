# core/render/expressions/running_totals.py
# Running totals engine — accumulates sums/counts across detail rows.
# Supports per-group reset.
from __future__ import annotations
from typing import Any


class RunningTotals:
    """
    Maintains running accumulators for fields across the detail band.
    
    Usage:
        rt = RunningTotals()
        rt.push(item)          # call for each detail row
        val = rt.running_sum("total")
        val = rt.running_count("name")
        rt.reset_group()       # reset group-scoped counters
        rt.reset_report()      # reset all
    """
    def __init__(self):
        self._sums:    dict[str, float] = {}
        self._counts:  dict[str, int]   = {}
        self._g_sums:  dict[str, float] = {}
        self._g_counts:dict[str, int]   = {}

    # ── Public API ────────────────────────────────────────────────
    def push(self, item: dict) -> None:
        """Accumulate all numeric fields in item."""
        for k, v in item.items():
            try:
                fv = float(v) if not isinstance(v, (int, float, bool)) else v
                if isinstance(fv, bool):
                    raise TypeError
                self._sums[k]   = self._sums.get(k, 0.0) + fv
                self._g_sums[k] = self._g_sums.get(k, 0.0) + fv
            except (TypeError, ValueError):
                pass
            self._counts[k]   = self._counts.get(k, 0) + 1
            self._g_counts[k] = self._g_counts.get(k, 0) + 1

    def running_sum(self, field: str, group_scope: bool = False) -> float:
        """Return cumulative sum of field up to current row."""
        field = _strip(field)
        src = self._g_sums if group_scope else self._sums
        return src.get(field, 0.0)

    def running_count(self, field: str, group_scope: bool = False) -> int:
        """Return cumulative count of field up to current row."""
        field = _strip(field)
        src = self._g_counts if group_scope else self._counts
        return src.get(field, 0)

    def reset_group(self) -> None:
        """Reset group-scoped accumulators (call at group boundary)."""
        self._g_sums.clear()
        self._g_counts.clear()

    def reset_report(self) -> None:
        """Full reset (start of report)."""
        self._sums.clear()
        self._counts.clear()
        self._g_sums.clear()
        self._g_counts.clear()

    def snapshot(self) -> dict:
        """Return current state for debugging."""
        return {
            "sums":    dict(self._sums),
            "counts":  dict(self._counts),
            "g_sums":  dict(self._g_sums),
            "g_counts":dict(self._g_counts),
        }


def _strip(path: str) -> str:
    """Normalize 'items.total' → 'total', 'total' → 'total'."""
    return path.rsplit(".", 1)[-1] if "." in path else path
