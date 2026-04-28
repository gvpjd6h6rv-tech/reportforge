from __future__ import annotations

import argparse

from .cli_layout import cmd_convert, cmd_info, cmd_validate
from .cli_render import cmd_export, cmd_preview, cmd_render, cmd_render_jrxml
from .cli_samples import cmd_list_styles, cmd_list_types, cmd_sample


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
        """,
    )
    sub = p.add_subparsers(dest="command", required=True)

    r = sub.add_parser("render", help="Render layout+data to PDF/HTML/CSV/XLSX")
    r.add_argument("layout")
    r.add_argument("data")
    r.add_argument("output")
    r.add_argument("--params", help="JSON file with report parameters")
    r.add_argument("--debug", action="store_true")
    r.set_defaults(func=cmd_render)

    j = sub.add_parser("render-jrxml", help="Render JRXML report")
    j.add_argument("jrxml")
    j.add_argument("data")
    j.add_argument("output")
    j.add_argument("--params", help="JSON file or inline JSON with parameters")
    j.add_argument("--debug", action="store_true")
    j.set_defaults(func=cmd_render_jrxml)

    pv = sub.add_parser("preview", help="Fast HTML preview (no PDF)")
    pv.add_argument("layout")
    pv.add_argument("data")
    pv.add_argument("--output", "-o", help="Output HTML path")
    pv.add_argument("--params", help="Parameters JSON file")
    pv.add_argument("--open", action="store_true", help="Open in browser")
    pv.set_defaults(func=cmd_preview)

    ex = sub.add_parser("export", help="Export to multiple formats")
    ex.add_argument("layout")
    ex.add_argument("data")
    ex.add_argument("--out", default="output", help="Output directory")
    ex.add_argument("--formats", nargs="+", default=["pdf", "html", "csv", "xlsx"])
    ex.add_argument("--debug", action="store_true")
    ex.set_defaults(func=cmd_export)

    vl = sub.add_parser("validate", help="Validate layout JSON")
    vl.add_argument("layout")
    vl.set_defaults(func=cmd_validate)

    nf = sub.add_parser("info", help="Show layout info")
    nf.add_argument("layout")
    nf.set_defaults(func=cmd_info)

    cv = sub.add_parser("convert", help="Convert JRXML to RFD layout")
    cv.add_argument("jrxml")
    cv.add_argument("output")
    cv.set_defaults(func=cmd_convert)

    sm = sub.add_parser("sample", help="Render a sample document")
    sm.add_argument("doc_type")
    sm.add_argument("--out", default="output", dest="out_dir")
    sm.set_defaults(func=cmd_sample)

    lt = sub.add_parser("list-types", help="List registered document types")
    lt.set_defaults(func=cmd_list_types)

    ls = sub.add_parser("list-styles", help="List available named styles")
    ls.set_defaults(func=cmd_list_styles)

    return p
