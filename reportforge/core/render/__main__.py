#!/usr/bin/env python3
# core/render/__main__.py  (also installable as python -m reportforge)
# ReportForge Command Line Interface
#
# Usage:
#   python -m reportforge render      layout.json data.json output.pdf
#   python -m reportforge render-jrxml report.jrxml data.json output.pdf
#   python -m reportforge preview     layout.json data.json
#   python -m reportforge export      layout.json data.json output.xlsx
#   python -m reportforge validate    layout.json
#   python -m reportforge info        layout.json
#   python -m reportforge sample      factura --out ./output
#   python -m reportforge list-types
#   python -m reportforge convert     report.jrxml output.rfd.json
from __future__ import annotations
import argparse, json, sys, time
from pathlib import Path

# Support both: python -m reportforge and python tools/test_render.py
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))


def _ok(msg:  str) -> None: print(f"  \033[32m✓\033[0m {msg}")
def _err(msg: str) -> None: print(f"  \033[31m✗\033[0m {msg}"); sys.exit(1)
def _info(msg:str) -> None: print(f"  \033[34m→\033[0m {msg}")
def _head(msg:str) -> None:
    print(f"\n{'='*60}\n  {msg}\n{'='*60}")


# ════════════════════════════════════════════════════════════════
# Commands
# ════════════════════════════════════════════════════════════════

def cmd_render(args: argparse.Namespace) -> None:
    """Render layout + data → PDF/HTML/CSV/XLSX"""
    from core.render.export.exporters import Exporter

    _head("ReportForge Render")
    t0 = time.perf_counter()

    layout = _load_json(args.layout,  "layout")
    data   = _load_json(args.data,    "data")
    params = _load_json(args.params,  "params") if args.params else {}
    out    = Path(args.output)
    fmt    = out.suffix.lstrip(".").lower() or "pdf"

    # Inject params into data
    if params:
        data = {**data, "param": params}

    try:
        from core.render.engines.enterprise_engine import EnterpriseHtmlEngine
        engine = EnterpriseHtmlEngine(
            layout, data, debug=args.debug,
            params=params, base_dir=Path(args.layout).parent
        )
        ex = Exporter(layout, data, debug=args.debug)
        ex._html = engine.render()

        out.parent.mkdir(parents=True, exist_ok=True)
        if fmt == "pdf":     ex.to_pdf(out)
        elif fmt == "html":  ex.to_html(out)
        elif fmt == "csv":   ex.to_csv(out)
        elif fmt == "xlsx":  ex.to_xlsx(out)
        else:                ex.to_html(out)

        elapsed = (time.perf_counter() - t0) * 1000
        _ok(f"Output: {out}  ({out.stat().st_size:,} bytes) in {elapsed:.0f}ms")
    except Exception as e:
        import traceback; traceback.print_exc()
        _err(str(e))


def cmd_render_jrxml(args: argparse.Namespace) -> None:
    """Render JRXML + data → PDF/HTML"""
    from core.render.compat.jrxml_parser import render_from_jrxml

    _head("ReportForge JRXML Render")
    t0 = time.perf_counter()

    data   = _load_json(args.data,   "data")
    params = _load_json(args.params, "params") if args.params else {}
    out    = Path(args.output)

    try:
        html = render_from_jrxml(data, args.jrxml,
                                  output_path=out,
                                  params=params,
                                  debug=args.debug)
        elapsed = (time.perf_counter() - t0) * 1000
        _ok(f"Output: {out}  ({len(html):,} bytes HTML) in {elapsed:.0f}ms")
    except Exception as e:
        import traceback; traceback.print_exc()
        _err(str(e))


def cmd_preview(args: argparse.Namespace) -> None:
    """Render layout → HTML preview (instant, no PDF generation)"""
    from core.render.engines.enterprise_engine import render_preview

    _head("ReportForge Preview")
    t0 = time.perf_counter()

    layout = _load_json(args.layout, "layout")
    data   = _load_json(args.data,   "data")
    params = _load_json(args.params, "params") if args.params else {}

    try:
        html    = render_preview(layout, data, params=params or None)
        elapsed = (time.perf_counter() - t0) * 1000

        out = Path(args.output) if args.output else (
            Path(args.layout).with_suffix(".preview.html")
        )
        out.write_text(html, encoding="utf-8")
        _ok(f"Preview: {out}  ({len(html):,} bytes) in {elapsed:.0f}ms")

        if args.open:
            import webbrowser
            webbrowser.open(out.resolve().as_uri())
    except Exception as e:
        import traceback; traceback.print_exc()
        _err(str(e))


def cmd_export(args: argparse.Namespace) -> None:
    """Export in multiple formats simultaneously"""
    from core.render.export.exporters import Exporter
    from core.render.engines.enterprise_engine import EnterpriseHtmlEngine

    _head("ReportForge Multi-Export")
    t0 = time.perf_counter()

    layout  = _load_json(args.layout, "layout")
    data    = _load_json(args.data,   "data")
    formats = args.formats or ["pdf", "html", "csv", "xlsx"]
    out_dir = Path(args.out_dir)
    stem    = Path(args.layout).stem

    engine = EnterpriseHtmlEngine(layout, data, debug=args.debug)
    ex     = Exporter(layout, data, debug=args.debug)
    ex._html = engine.render()

    out_dir.mkdir(parents=True, exist_ok=True)
    for fmt in formats:
        p = out_dir / f"{stem}.{fmt}"
        try:
            if fmt == "pdf":  ex.to_pdf(p)
            elif fmt == "html": ex.to_html(p)
            elif fmt == "csv":  ex.to_csv(p)
            elif fmt == "xlsx": ex.to_xlsx(p)
            _ok(f"{fmt.upper()}: {p}  ({p.stat().st_size:,} bytes)")
        except Exception as e:
            _info(f"{fmt.upper()}: skipped — {e}")

    elapsed = (time.perf_counter() - t0) * 1000
    print(f"\n  Done in {elapsed:.0f}ms\n")


def cmd_validate(args: argparse.Namespace) -> None:
    """Validate layout JSON structure"""
    from core.render.pipeline.normalizer import normalize_layout

    _head("ReportForge Validate")
    layout = _load_json(args.layout, "layout")
    errors = []

    try:
        norm = normalize_layout(layout)
    except Exception as e:
        _err(f"Normalization failed: {e}")

    n_sec = len(norm.get("sections", []))
    n_el  = len(norm.get("elements", []))
    _ok(f"Layout loaded:  {n_sec} sections, {n_el} elements")

    # Check section IDs referenced by elements
    sec_ids = {s["id"] for s in norm.get("sections", [])}
    for el in norm.get("elements", []):
        sid = el.get("sectionId", "")
        if sid not in sec_ids:
            errors.append(f"Element {el.get('id','?')} references unknown section {sid!r}")

    # Check required fields
    for s in norm.get("sections", []):
        if not s.get("stype"):
            errors.append(f"Section {s.get('id','?')} has no stype")

    if errors:
        for e in errors:
            print(f"  \033[33m⚠\033[0m {e}")
        print(f"\n  {len(errors)} warning(s) found\n")
    else:
        _ok("Validation passed — no errors found")
    print()


def cmd_info(args: argparse.Namespace) -> None:
    """Show layout info and statistics"""
    from core.render.pipeline.normalizer import normalize_layout

    _head("ReportForge Layout Info")
    layout = _load_json(args.layout, "layout")
    norm   = normalize_layout(layout)

    print(f"  Name:       {norm.get('name','?')}")
    print(f"  Page size:  {norm.get('pageSize','A4')} {norm.get('orientation','portrait')}")
    print(f"  Dimensions: {norm.get('pageWidth')}×{norm.get('pageHeight')} px")
    margins = norm.get("margins",{})
    print(f"  Margins:    T{margins.get('top')} R{margins.get('right')} "
          f"B{margins.get('bottom')} L{margins.get('left')} mm")
    print()

    sec_counts: dict = {}
    for s in norm.get("sections",[]):
        sec_counts[s["stype"]] = sec_counts.get(s["stype"],0)+1
    print("  Sections:")
    for k,v in sorted(sec_counts.items()):
        labels = {"rh":"Report Header","ph":"Page Header","gh":"Group Header",
                  "det":"Detail","gf":"Group Footer","pf":"Page Footer","rf":"Report Footer"}
        print(f"    {labels.get(k,k):<20} × {v}")
    print()

    el_counts: dict = {}
    for e in norm.get("elements",[]):
        t = e.get("type","?")
        el_counts[t] = el_counts.get(t,0)+1
    print("  Elements:")
    for k,v in sorted(el_counts.items()):
        print(f"    {k:<20} × {v}")

    groups = norm.get("groups",[])
    if groups:
        print(f"\n  Groups: {', '.join(g.get('field','?') for g in groups)}")
    params = norm.get("parameters",[])
    if params:
        print(f"\n  Parameters: {', '.join(p.get('name','?') for p in params)}")
    print()


def cmd_convert(args: argparse.Namespace) -> None:
    """Convert JRXML to ReportForge layout JSON"""
    from core.render.compat.jrxml_parser import parse_jrxml

    _head("ReportForge Convert JRXML → RFD")
    try:
        layout = parse_jrxml(args.jrxml)
        out    = Path(args.output)
        out.write_text(json.dumps(layout, indent=2, ensure_ascii=False), encoding="utf-8")
        n_sec = len(layout.get("sections",[]))
        n_el  = len(layout.get("elements",[]))
        _ok(f"Converted: {out}  ({n_sec} sections, {n_el} elements)")
    except Exception as e:
        _err(str(e))
    print()


def cmd_sample(args: argparse.Namespace) -> None:
    """Render a sample document"""
    _head(f"ReportForge Sample — {args.doc_type}")
    try:
        from core.render.doc_registry import get_doc_type
        dt = get_doc_type(args.doc_type)
    except (KeyError, Exception):
        _err(f"Unknown doc type: {args.doc_type!r}. Run list-types to see options.")

    from core.render.engines.enterprise_engine import EnterpriseHtmlEngine
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    layout = dt.default_layout()
    raw = {
        "name": dt.label, "pageSize": "A4",
        "sections": [{"id":s.id,"stype":s.stype,"height":s.height} for s in layout.sections],
        "elements": [_el_obj_to_dict(e) for e in layout.elements],
    }
    data = dt.sample_data
    html = EnterpriseHtmlEngine(raw, data).render()
    out  = out_dir / f"sample_{args.doc_type}.html"
    out.write_text(html, encoding="utf-8")
    _ok(f"HTML: {out}  ({len(html):,} bytes)")
    out2 = out_dir / f"sample_{args.doc_type}_data.json"
    out2.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    _ok(f"Data: {out2}")
    print()


def cmd_list_types(args: argparse.Namespace) -> None:
    """List registered SRI document types"""
    _head("ReportForge — Document Types")
    try:
        from core.render.doc_registry import list_doc_types
        types = list_doc_types()
        for dt in types:
            print(f"  {dt['sri_code']}  {dt['key']:<20} {dt['label']}")
    except ImportError:
        print("  (doc_registry not available)")
    print()


# ════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════

def _load_json(path: str, label: str) -> dict:
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        _ok(f"{label.title()} loaded: {path}  ({len(Path(path).read_bytes()):,} bytes)")
        return raw
    except FileNotFoundError:
        _err(f"{label.title()} file not found: {path}")
    except json.JSONDecodeError as e:
        _err(f"Invalid JSON in {path}: {e}")


def _el_obj_to_dict(e) -> dict:
    fields = ["id","type","sectionId","x","y","w","h",
              "content","fieldPath","fieldFmt",
              "fontSize","bold","italic","underline","fontFamily",
              "align","color","bgColor","borderColor","borderWidth","borderStyle",
              "lineDir","lineWidth","zIndex"]
    return {f: getattr(e, f, None) for f in fields if getattr(e, f, None) is not None}


# ════════════════════════════════════════════════════════════════
# Argument parser
# ════════════════════════════════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="reportforge",
        description="ReportForge — Enterprise Report Engine",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m reportforge render      sales.rfd.json data.json output.pdf
  python -m reportforge render      sales.rfd.json data.json output.xlsx
  python -m reportforge render-jrxml report.jrxml  data.json output.pdf
  python -m reportforge preview     sales.rfd.json data.json
  python -m reportforge export      sales.rfd.json data.json --out ./out --formats pdf xlsx csv
  python -m reportforge validate    sales.rfd.json
  python -m reportforge info        sales.rfd.json
  python -m reportforge convert     jasper.jrxml   output.rfd.json
  python -m reportforge sample      factura --out  ./output
  python -m reportforge list-types
        """
    )
    sub = p.add_subparsers(dest="command", required=True)

    # render
    r = sub.add_parser("render", help="Render layout+data to PDF/HTML/CSV/XLSX")
    r.add_argument("layout");  r.add_argument("data"); r.add_argument("output")
    r.add_argument("--params",  help="JSON file with report parameters")
    r.add_argument("--debug",   action="store_true")
    r.set_defaults(func=cmd_render)

    # render-jrxml
    j = sub.add_parser("render-jrxml", help="Render JRXML report")
    j.add_argument("jrxml");   j.add_argument("data"); j.add_argument("output")
    j.add_argument("--params", help="JSON file or inline JSON with parameters")
    j.add_argument("--debug",  action="store_true")
    j.set_defaults(func=cmd_render_jrxml)

    # preview
    pv = sub.add_parser("preview", help="Fast HTML preview (no PDF)")
    pv.add_argument("layout"); pv.add_argument("data")
    pv.add_argument("--output", "-o", help="Output HTML path")
    pv.add_argument("--params", help="Parameters JSON file")
    pv.add_argument("--open",   action="store_true", help="Open in browser")
    pv.set_defaults(func=cmd_preview)

    # export
    ex = sub.add_parser("export", help="Export to multiple formats")
    ex.add_argument("layout"); ex.add_argument("data")
    ex.add_argument("--out",  default="output", help="Output directory")
    ex.add_argument("--formats", nargs="+", default=["pdf","html","csv","xlsx"])
    ex.add_argument("--debug", action="store_true")
    ex.set_defaults(func=cmd_export)

    # validate
    vl = sub.add_parser("validate", help="Validate layout JSON")
    vl.add_argument("layout")
    vl.set_defaults(func=cmd_validate)

    # info
    nf = sub.add_parser("info", help="Show layout info")
    nf.add_argument("layout")
    nf.set_defaults(func=cmd_info)

    # convert
    cv = sub.add_parser("convert", help="Convert JRXML to RFD layout")
    cv.add_argument("jrxml"); cv.add_argument("output")
    cv.set_defaults(func=cmd_convert)

    # sample
    sm = sub.add_parser("sample", help="Render a sample document")
    sm.add_argument("doc_type")
    sm.add_argument("--out", default="output", dest="out_dir")
    sm.set_defaults(func=cmd_sample)

    # list-types
    lt = sub.add_parser("list-types", help="List registered document types")
    lt.set_defaults(func=cmd_list_types)

    return p


def main() -> None:
    parser = build_parser()
    args   = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
