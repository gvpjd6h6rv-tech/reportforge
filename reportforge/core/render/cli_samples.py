from __future__ import annotations

import argparse
import json
from pathlib import Path

from .cli_io import err, el_obj_to_dict, head, ok


def cmd_sample(args: argparse.Namespace) -> None:
    """Render a sample document"""
    head(f"ReportForge Sample — {args.doc_type}")
    try:
        from core.render.doc_registry import get_doc_type
        dt = get_doc_type(args.doc_type)
    except (KeyError, Exception):
        err(f"Unknown doc type: {args.doc_type!r}. Run list-types to see options.")

    from core.render.engines.enterprise_engine import EnterpriseHtmlEngine

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    layout = dt.default_layout()
    raw = {
        "name": dt.label,
        "pageSize": "A4",
        "sections": [{"id": s.id, "stype": s.stype, "height": s.height} for s in layout.sections],
        "elements": [el_obj_to_dict(e) for e in layout.elements],
    }
    data = dt.sample_data
    html = EnterpriseHtmlEngine(raw, data).render()
    out = out_dir / f"sample_{args.doc_type}.html"
    out.write_text(html, encoding="utf-8")
    ok(f"HTML: {out}  ({len(html):,} bytes)")
    out2 = out_dir / f"sample_{args.doc_type}_data.json"
    out2.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    ok(f"Data: {out2}")
    print()


def cmd_list_types(args: argparse.Namespace) -> None:
    """List registered SRI document types"""
    head("ReportForge — Document Types")
    try:
        from core.render.doc_registry import list_doc_types
        types = list_doc_types()
        for dt in types:
            print(f"  {dt['sri_code']}  {dt['key']:<20} {dt['label']}")
    except ImportError:
        print("  (doc_registry not available)")
    print()


def cmd_list_styles(args: argparse.Namespace) -> None:
    """List available named styles."""
    head("ReportForge — Styles")
    try:
        from core.render.styles import DEFAULT_REGISTRY
        for name in DEFAULT_REGISTRY.list_styles():
            props = DEFAULT_REGISTRY.resolve(name)
            attrs = ", ".join(f"{k}={v}" for k, v in list(props.items())[:3])
            print(f"  {name:<22}  {attrs}")
    except ImportError:
        print("  (styles not available)")
    print()
