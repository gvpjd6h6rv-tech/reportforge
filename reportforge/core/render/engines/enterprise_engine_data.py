from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..datasource import DataSource, MultiDataset


def resolve_data(data: Any, datasets: dict | None = None) -> dict:
    if isinstance(data, str) and (data.startswith("http") or data.endswith(".json")):
        data = DataSource.load(data)
    if not isinstance(data, dict):
        data = {"items": list(data) if hasattr(data, "__iter__") else []}
    if datasets:
        md = MultiDataset(datasets)
        data = {**data, **md.merged()}
    return data


def render_enterprise(layout_raw, data, output_path=None, **kw) -> str:
    from .enterprise_engine import EnterpriseEngine
    if isinstance(layout_raw, (str, Path)):
        layout_raw = json.loads(Path(layout_raw).read_text(encoding="utf-8"))
    if isinstance(data, (str, Path)):
        data = json.loads(Path(data).read_text(encoding="utf-8"))
    html = EnterpriseEngine(layout_raw, data, **kw).render()
    if output_path:
        Path(output_path).write_text(html, encoding="utf-8")
    return html


def render_preview(layout_raw, data, **kw) -> str:
    from .enterprise_engine import EnterpriseEngine
    if isinstance(layout_raw, (str, Path)):
        layout_raw = json.loads(Path(layout_raw).read_text(encoding="utf-8"))
    if isinstance(data, (str, Path)):
        data = json.loads(Path(data).read_text(encoding="utf-8"))
    kw.pop("preview", None)
    return EnterpriseEngine(layout_raw, data, preview=True, **kw).render_preview()

