from __future__ import annotations

import argparse
import json
from pathlib import Path

from .cli_io import err, head, load_json, ok


def cmd_validate(args: argparse.Namespace) -> None:
    """Validate layout JSON structure"""
    from core.render.pipeline.normalizer import normalize_layout

    head("ReportForge Validate")
    layout = load_json(args.layout, "layout")
    errors = []

    try:
        norm = normalize_layout(layout)
    except Exception as e:
        err(f"Normalization failed: {e}")

    n_sec = len(norm.get("sections", []))
    n_el = len(norm.get("elements", []))
    ok(f"Layout loaded:  {n_sec} sections, {n_el} elements")

    sec_ids = {s["id"] for s in norm.get("sections", [])}
    for el in norm.get("elements", []):
        sid = el.get("sectionId", "")
        if sid not in sec_ids:
            errors.append(f"Element {el.get('id','?')} references unknown section {sid!r}")

    for s in norm.get("sections", []):
        if not s.get("stype"):
            errors.append(f"Section {s.get('id','?')} has no stype")

    if errors:
        for e in errors:
            print(f"  \033[33m⚠\033[0m {e}")
        print(f"\n  {len(errors)} warning(s) found\n")
    else:
        ok("Validation passed — no errors found")
    print()


def cmd_info(args: argparse.Namespace) -> None:
    """Show layout info and statistics"""
    from core.render.pipeline.normalizer import normalize_layout

    head("ReportForge Layout Info")
    layout = load_json(args.layout, "layout")
    norm = normalize_layout(layout)

    print(f"  Name:       {norm.get('name','?')}")
    print(f"  Page size:  {norm.get('pageSize','A4')} {norm.get('orientation','portrait')}")
    print(f"  Dimensions: {norm.get('pageWidth')}×{norm.get('pageHeight')} px")
    margins = norm.get("margins", {})
    print(
        f"  Margins:    T{margins.get('top')} R{margins.get('right')} "
        f"B{margins.get('bottom')} L{margins.get('left')} mm"
    )
    print()

    sec_counts: dict = {}
    for s in norm.get("sections", []):
        sec_counts[s["stype"]] = sec_counts.get(s["stype"], 0) + 1
    print("  Sections:")
    for k, v in sorted(sec_counts.items()):
        labels = {
            "rh": "Report Header",
            "ph": "Page Header",
            "gh": "Group Header",
            "det": "Detail",
            "gf": "Group Footer",
            "pf": "Page Footer",
            "rf": "Report Footer",
        }
        print(f"    {labels.get(k,k):<20} × {v}")
    print()

    el_counts: dict = {}
    for e in norm.get("elements", []):
        t = e.get("type", "?")
        el_counts[t] = el_counts.get(t, 0) + 1
    print("  Elements:")
    for k, v in sorted(el_counts.items()):
        print(f"    {k:<20} × {v}")

    groups = norm.get("groups", [])
    if groups:
        print(f"\n  Groups: {', '.join(g.get('field','?') for g in groups)}")
    params = norm.get("parameters", [])
    if params:
        print(f"\n  Parameters: {', '.join(p.get('name','?') for p in params)}")
    print()


def cmd_convert(args: argparse.Namespace) -> None:
    """Convert JRXML to ReportForge layout JSON"""
    from core.render.compat.jrxml_parser import parse_jrxml

    head("ReportForge Convert JRXML → RFD")
    try:
        layout = parse_jrxml(args.jrxml)
        out = Path(args.output)
        out.write_text(json.dumps(layout, indent=2, ensure_ascii=False), encoding="utf-8")
        n_sec = len(layout.get("sections", []))
        n_el = len(layout.get("elements", []))
        ok(f"Converted: {out}  ({n_sec} sections, {n_el} elements)")
    except Exception as e:
        err(str(e))
    print()
