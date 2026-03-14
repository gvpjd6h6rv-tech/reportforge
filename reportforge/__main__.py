#!/usr/bin/env python3
# reportforge/__main__.py
# ReportForge CLI
# Usage:
#   python -m reportforge render layout.json data.json output.pdf
#   python -m reportforge render-jrxml report.jrxml data.json output.pdf
#   python -m reportforge preview layout.json data.json
#   python -m reportforge export-csv layout.json data.json output.csv
#   python -m reportforge export-xlsx layout.json data.json output.xlsx
#   python -m reportforge export-png layout.json data.json output.png
#   python -m reportforge list-styles
from __future__ import annotations
import argparse, json, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _ok(msg):  print(f"  \033[32m✓\033[0m {msg}")
def _err(msg): print(f"  \033[31m✗\033[0m {msg}"); sys.exit(1)
def _inf(msg): print(f"  \033[34m→\033[0m {msg}")


def _load_json(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        _err(f"File not found: {path}")
    return json.loads(p.read_text(encoding="utf-8"))


def cmd_render(args):
    """Render layout + data → PDF (via HTML)."""
    from core.render.engines.enterprise_engine import EnterpriseEngine
    from core.render.engines.pdf_generator import PdfGenerator

    print(f"\n{'='*60}\n  ReportForge — Render\n{'='*60}")
    layout = _load_json(args.layout)
    data   = _load_json(args.data)
    params = json.loads(args.params) if args.params else {}

    t0 = time.perf_counter()
    engine = EnterpriseEngine(layout, data, params=params, debug=args.debug,
                              layout_path=Path(args.layout))
    html = engine.render()
    t_html = time.perf_counter() - t0
    _ok(f"HTML rendered in {t_html*1000:.1f}ms  ({len(html):,} bytes)")

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)

    if out.suffix.lower() == ".html":
        out.write_text(html, encoding="utf-8")
        _ok(f"HTML saved: {out}")
    else:
        try:
            t1 = time.perf_counter()
            PdfGenerator().from_html_to_file(html, out)
            _ok(f"PDF saved: {out}  ({out.stat().st_size//1024} KB) in {(time.perf_counter()-t1)*1000:.0f}ms")
        except Exception as e:
            _inf(f"PDF generation failed ({e}) — saving HTML instead")
            html_out = out.with_suffix(".html")
            html_out.write_text(html, encoding="utf-8")
            _ok(f"HTML saved: {html_out}")

    _ok(f"Done in {(time.perf_counter()-t0)*1000:.1f}ms")


def cmd_render_jrxml(args):
    """Render JRXML report → PDF."""
    from core.render.jrxml_parser import render_from_jrxml
    from core.render.engines.pdf_generator import PdfGenerator

    print(f"\n{'='*60}\n  ReportForge — Render JRXML\n{'='*60}")
    data   = _load_json(args.data)
    params = json.loads(args.params) if args.params else {}

    t0 = time.perf_counter()
    html = render_from_jrxml(data, args.jrxml, params=params)
    _ok(f"JRXML parsed and rendered in {(time.perf_counter()-t0)*1000:.1f}ms  ({len(html):,} bytes)")

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.suffix.lower() == ".html":
        out.write_text(html, encoding="utf-8")
        _ok(f"HTML saved: {out}")
    else:
        try:
            PdfGenerator().from_html_to_file(html, out)
            _ok(f"PDF saved: {out}")
        except Exception as e:
            html_out = out.with_suffix(".html")
            html_out.write_text(html, encoding="utf-8")
            _ok(f"HTML saved (PDF failed: {e}): {html_out}")


def cmd_preview(args):
    """Fast preview — render to HTML without PDF."""
    from core.render.engines.enterprise_engine import render_preview

    print(f"\n{'='*60}\n  ReportForge — Preview\n{'='*60}")
    layout = _load_json(args.layout)
    data   = _load_json(args.data)
    params = json.loads(args.params) if args.params else {}

    t0 = time.perf_counter()
    html = render_preview(layout, data, params=params, debug=args.debug)
    t_ms = (time.perf_counter() - t0) * 1000
    _ok(f"Preview rendered in {t_ms:.1f}ms  ({len(html):,} bytes)")

    out = Path(args.output) if args.output else Path("output/preview.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    _ok(f"Preview saved: {out}")


def cmd_export_csv(args):
    """Export data to CSV."""
    from core.render.export.csv_export import export_csv

    data = _load_json(args.data)
    out  = export_csv(data, args.output, dataset=args.dataset or "items")
    _ok(f"CSV exported: {out}")


def cmd_export_xlsx(args):
    """Export data to Excel."""
    from core.render.export.xlsx_export import export_xlsx

    data   = _load_json(args.data)
    layout = _load_json(args.layout) if args.layout else {}
    title  = layout.get("name", "Report")
    out    = export_xlsx(data, args.output, title=title)
    _ok(f"XLSX exported: {out}  ({out.stat().st_size//1024} KB)")


def cmd_export_png(args):
    """Export first page to PNG."""
    from core.render.engines.enterprise_engine import EnterpriseEngine
    from core.render.export.png_export import export_png

    layout = _load_json(args.layout)
    data   = _load_json(args.data)
    html   = EnterpriseEngine(layout, data).render()
    out    = export_png(html, args.output)
    _ok(f"PNG exported: {out}")


def cmd_list_styles(args):
    """List available named styles."""
    from core.render.styles import DEFAULT_REGISTRY
    print(f"\n{'='*50}\n  ReportForge Styles\n{'='*50}")
    for name in DEFAULT_REGISTRY.list_styles():
        props = DEFAULT_REGISTRY.resolve(name)
        attrs = ", ".join(f"{k}={v}" for k, v in list(props.items())[:3])
        print(f"  {name:<22}  {attrs}")
    print()


def main():
    parser = argparse.ArgumentParser(
        prog="python -m reportforge",
        description="ReportForge Enterprise CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m reportforge render layout.json data.json output.pdf
  python -m reportforge render layout.json data.json output.html
  python -m reportforge render-jrxml report.jrxml data.json output.pdf
  python -m reportforge preview layout.json data.json
  python -m reportforge export-csv data.json output.csv
  python -m reportforge export-xlsx data.json output.xlsx
  python -m reportforge export-png layout.json data.json output.png
  python -m reportforge list-styles
        """)

    sub = parser.add_subparsers(dest="command")

    # render
    p_render = sub.add_parser("render", help="Render layout + data to PDF/HTML")
    p_render.add_argument("layout")
    p_render.add_argument("data")
    p_render.add_argument("output")
    p_render.add_argument("--params", help="JSON params string")
    p_render.add_argument("--debug", action="store_true")

    # render-jrxml
    p_jrxml = sub.add_parser("render-jrxml", help="Render JRXML report to PDF/HTML")
    p_jrxml.add_argument("jrxml")
    p_jrxml.add_argument("data")
    p_jrxml.add_argument("output")
    p_jrxml.add_argument("--params", help="JSON params string")

    # preview
    p_prev = sub.add_parser("preview", help="Fast HTML preview (no PDF)")
    p_prev.add_argument("layout")
    p_prev.add_argument("data")
    p_prev.add_argument("--output", default="output/preview.html")
    p_prev.add_argument("--params", help="JSON params string")
    p_prev.add_argument("--debug", action="store_true")

    # export-csv
    p_csv = sub.add_parser("export-csv", help="Export data to CSV")
    p_csv.add_argument("data")
    p_csv.add_argument("output")
    p_csv.add_argument("--dataset", default="items")

    # export-xlsx
    p_xlsx = sub.add_parser("export-xlsx", help="Export data to Excel")
    p_xlsx.add_argument("data")
    p_xlsx.add_argument("output")
    p_xlsx.add_argument("--layout", default=None)

    # export-png
    p_png = sub.add_parser("export-png", help="Export report to PNG")
    p_png.add_argument("layout")
    p_png.add_argument("data")
    p_png.add_argument("output")

    # list-styles
    sub.add_parser("list-styles", help="List available named styles")

    args = parser.parse_args()

    dispatch = {
        "render":        cmd_render,
        "render-jrxml":  cmd_render_jrxml,
        "preview":       cmd_preview,
        "export-csv":    cmd_export_csv,
        "export-xlsx":   cmd_export_xlsx,
        "export-png":    cmd_export_png,
        "list-styles":   cmd_list_styles,
    }

    if not args.command:
        parser.print_help()
        return

    fn = dispatch.get(args.command)
    if fn:
        fn(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
