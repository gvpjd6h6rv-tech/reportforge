#!/usr/bin/env python3
# tools/test_render.py
# ─────────────────────────────────────────────────────────────────
# ReportForge CLI — render a layout + dataset to HTML (and PDF)
#
# Usage:
#   python test_render.py layout.json data.json
#   python test_render.py layout.json data.json --out ./output
#   python test_render.py layout.json data.json --pdf
#   python test_render.py layout.json data.json --debug
#   python test_render.py --list-types
#   python test_render.py --sample factura
# ─────────────────────────────────────────────────────────────────
from __future__ import annotations
import argparse, json, sys, time
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

def _ok(msg): print(f"  \033[32m✓\033[0m {msg}")
def _err(msg): print(f"  \033[31m✗\033[0m {msg}"); sys.exit(1)
def _info(msg): print(f"  \033[34m→\033[0m {msg}")


def cmd_render(layout_path: Path, data_path: Path, out_dir: Path,
               pdf: bool, debug: bool) -> None:
    from core.render.engines.advanced_engine import AdvancedHtmlEngine

    print(f"\n{'='*60}")
    print(f"  ReportForge Render")
    print(f"{'='*60}")

    # Load layout
    t0 = time.perf_counter()
    try:
        layout = json.loads(layout_path.read_text(encoding="utf-8"))
        _ok(f"Layout loaded: {layout_path.name}  ({len(json.dumps(layout)):,} bytes)")
    except Exception as e:
        _err(f"Failed to load layout: {e}")

    # Load data
    try:
        data = json.loads(data_path.read_text(encoding="utf-8"))
        n_items = len(data.get("items", []))
        _ok(f"Data loaded: {data_path.name}  ({n_items} detail items)")
    except Exception as e:
        _err(f"Failed to load data: {e}")

    # Render
    try:
        engine = AdvancedHtmlEngine(layout, data, debug=debug)
        html = engine.render()
        t_html = time.perf_counter() - t0
        _ok(f"HTML rendered in {t_html*1000:.1f}ms  ({len(html):,} bytes)")
    except Exception as e:
        import traceback; traceback.print_exc()
        _err(f"Render failed: {e}")

    # Save HTML
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = layout_path.stem
    html_path = out_dir / f"{stem}.html"
    html_path.write_text(html, encoding="utf-8")
    _ok(f"HTML saved: {html_path}")

    # Stats
    layout_norm = engine._norm
    n_sec = len(layout_norm.get("sections", []))
    n_el  = len(layout_norm.get("elements", []))
    import re
    n_pages = html.count('class="rpt-page"')
    n_rows  = len(re.findall(r'<div class="cr-detail-row"', html))
    _info(f"Sections: {n_sec}  Elements: {n_el}  Pages: {n_pages}  Detail rows: {n_rows}")

    # PDF
    if pdf:
        try:
            from core.render.engines.pdf_generator import PdfGenerator
            pdf_path = out_dir / f"{stem}.pdf"
            t1 = time.perf_counter()
            PdfGenerator().from_html_to_file(html, pdf_path)
            t_pdf = time.perf_counter() - t1
            _ok(f"PDF saved: {pdf_path}  ({pdf_path.stat().st_size/1024:.1f} KB) in {t_pdf*1000:.0f}ms")
        except ImportError:
            _info("WeasyPrint not installed — skipping PDF generation")
            _info("Install with: pip install weasyprint")
        except Exception as e:
            _err(f"PDF generation failed: {e}")

    print(f"\n  Done in {(time.perf_counter()-t0)*1000:.1f}ms\n")


def cmd_list_types() -> None:
    from core.render.doc_registry import list_doc_types
    types = list_doc_types()
    print(f"\n{'='*50}")
    print(f"  ReportForge — Registered Document Types")
    print(f"{'='*50}")
    for dt in types:
        print(f"  {dt['sri_code']}  {dt['key']:<20} {dt['label']}")
    print()


def cmd_sample(doc_type: str, out_dir: Path) -> None:
    from core.render.doc_registry import get_doc_type
    from core.render.engines.advanced_engine import AdvancedHtmlEngine

    try:
        dt = get_doc_type(doc_type)
    except KeyError:
        _err(f"Unknown doc type: {doc_type!r}. Run --list-types to see options.")

    print(f"\n{'='*60}")
    print(f"  Sample render: {dt.label} (SRI {dt.sri_code})")
    print(f"{'='*60}")

    layout = dt.default_layout()
    raw = {
        "name": dt.label, "pageSize": "A4", "pageWidth": 754,
        "margins": {"top":15,"bottom":15,"left":20,"right":20},
        "sections": [{"id":s.id,"stype":s.stype,"height":s.height} for s in layout.sections],
        "elements": [{
            "id":e.id,"type":e.type,"sectionId":e.sectionId,
            "x":e.x,"y":e.y,"w":e.w,"h":e.h,
            "content":e.content,"fieldPath":e.fieldPath,"fieldFmt":e.fieldFmt,
            "fontSize":e.fontSize,"bold":e.bold,"italic":e.italic,"underline":e.underline,
            "align":e.align,"color":e.color,"bgColor":e.bgColor,
            "borderColor":e.borderColor,"borderWidth":e.borderWidth,"borderStyle":e.borderStyle,
            "lineDir":e.lineDir,"lineWidth":e.lineWidth,"zIndex":e.zIndex,
            "fontFamily":e.fontFamily,
        } for e in layout.elements],
    }
    data = dt.sample_data

    engine = AdvancedHtmlEngine(raw, data)
    html   = engine.render()
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / f"sample_{doc_type}.html"
    html_path.write_text(html, encoding="utf-8")
    _ok(f"Sample HTML: {html_path}  ({len(html):,} bytes)")

    # Save sample data JSON
    data_path = out_dir / f"sample_{doc_type}_data.json"
    data_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    _ok(f"Sample data: {data_path}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="test_render",
        description="ReportForge CLI — render layout + data to HTML/PDF",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python test_render.py examples/sales_report.rfd.json examples/sales_data.json
  python test_render.py examples/sales_report.rfd.json examples/sales_data.json --pdf
  python test_render.py --sample factura --out output/
  python test_render.py --list-types
        """,
    )
    parser.add_argument("layout",   nargs="?", type=Path, help="Layout .rfd.json file")
    parser.add_argument("data",     nargs="?", type=Path, help="Data .json file")
    parser.add_argument("--out",    type=Path, default=Path("output"), help="Output directory (default: output/)")
    parser.add_argument("--pdf",    action="store_true", help="Generate PDF (requires WeasyPrint)")
    parser.add_argument("--debug",  action="store_true", help="Add debug outlines to sections")
    parser.add_argument("--list-types", action="store_true", help="List registered document types")
    parser.add_argument("--sample", metavar="DOC_TYPE", help="Render a sample document (e.g. factura)")
    args = parser.parse_args()

    if args.list_types:
        cmd_list_types(); return

    if args.sample:
        cmd_sample(args.sample, args.out); return

    if not args.layout or not args.data:
        parser.print_help(); sys.exit(1)

    if not args.layout.exists():
        _err(f"Layout file not found: {args.layout}")
    if not args.data.exists():
        _err(f"Data file not found: {args.data}")

    cmd_render(args.layout, args.data, args.out, args.pdf, args.debug)


if __name__ == "__main__":
    main()
