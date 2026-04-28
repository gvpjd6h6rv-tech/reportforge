from __future__ import annotations

import html

_MPL_AVAILABLE = False
plt = None
mpatches = None
try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.patches as _mpatches
    import matplotlib.pyplot as _plt

    plt = _plt
    mpatches = _mpatches
    _MPL_AVAILABLE = True
except ImportError:
    pass

_PALETTE = [
    "#1A3A6B", "#C0511A", "#2E7D32", "#C62828", "#4A148C",
    "#1565C0", "#F57F17", "#00838F", "#558B2F", "#6A1B9A",
]


def flt(value) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def esc(value) -> str:
    return html.escape(str(value))


def get_items(data: dict, path: str) -> list:
    cur = data
    for key in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(key, [])
        else:
            return []
    return cur if isinstance(cur, list) else []

