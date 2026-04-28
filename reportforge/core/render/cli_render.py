from __future__ import annotations

import argparse
import time
from pathlib import Path

from .cli_io import err, head, info, load_json, ok


def cmd_render(args: argparse.Namespace) -> None:
    """Render layout + data → PDF/HTML/CSV/XLSX"""
    from core.render.export.exporters import Exporter

    head("ReportForge Render")
    t0 = time.perf_counter()

    layout = load_json(args.layout, "layout")
    data = load_json(args.data, "data")
    params = load_json(args.params, "params") if args.params else {}
    out = Path(args.output)
    fmt = out.suffix.lstrip(".").lower() or "pdf"

    if params:
        data = {**data, "param": params}

    try:
        from core.render.engines.enterprise_engine import EnterpriseHtmlEngine

        engine = EnterpriseHtmlEngine(
            layout,
            data,
            debug=args.debug,
            params=params,
            base_dir=Path(args.layout).parent,
        )
        ex = Exporter(layout, data, debug=args.debug)
        ex._html = engine.render()

        out.parent.mkdir(parents=True, exist_ok=True)
        if fmt == "pdf":
            ex.to_pdf(out)
        elif fmt == "html":
            ex.to_html(out)
        elif fmt == "csv":
            ex.to_csv(out)
        elif fmt == "xlsx":
            ex.to_xlsx(out)
        else:
            ex.to_html(out)

        elapsed = (time.perf_counter() - t0) * 1000
        ok(f"Output: {out}  ({out.stat().st_size:,} bytes) in {elapsed:.0f}ms")
    except Exception as e:
        import traceback

        traceback.print_exc()
        err(str(e))


def cmd_render_jrxml(args: argparse.Namespace) -> None:
    """Render JRXML + data → PDF/HTML"""
    from core.render.compat.jrxml_parser import render_from_jrxml

    head("ReportForge JRXML Render")
    t0 = time.perf_counter()

    data = load_json(args.data, "data")
    params = load_json(args.params, "params") if args.params else {}
    out = Path(args.output)

    try:
        html = render_from_jrxml(
            data,
            args.jrxml,
            output_path=out,
            params=params,
            debug=args.debug,
        )
        elapsed = (time.perf_counter() - t0) * 1000
        ok(f"Output: {out}  ({len(html):,} bytes HTML) in {elapsed:.0f}ms")
    except Exception as e:
        import traceback

        traceback.print_exc()
        err(str(e))


def cmd_preview(args: argparse.Namespace) -> None:
    """Render layout → HTML preview (instant, no PDF generation)"""
    from core.render.engines.enterprise_engine import render_preview

    head("ReportForge Preview")
    t0 = time.perf_counter()

    layout = load_json(args.layout, "layout")
    data = load_json(args.data, "data")
    params = load_json(args.params, "params") if args.params else {}

    try:
        html = render_preview(layout, data, params=params or None)
        elapsed = (time.perf_counter() - t0) * 1000

        out = Path(args.output) if args.output else Path(args.layout).with_suffix(".preview.html")
        out.write_text(html, encoding="utf-8")
        ok(f"Preview: {out}  ({len(html):,} bytes) in {elapsed:.0f}ms")

        if args.open:
            import webbrowser

            webbrowser.open(out.resolve().as_uri())
    except Exception as e:
        import traceback

        traceback.print_exc()
        err(str(e))


def cmd_export(args: argparse.Namespace) -> None:
    """Export in multiple formats simultaneously"""
    from core.render.export.exporters import Exporter
    from core.render.engines.enterprise_engine import EnterpriseHtmlEngine

    head("ReportForge Multi-Export")
    t0 = time.perf_counter()

    layout = load_json(args.layout, "layout")
    data = load_json(args.data, "data")
    formats = args.formats or ["pdf", "html", "csv", "xlsx"]
    out_dir = Path(args.out_dir)
    stem = Path(args.layout).stem

    engine = EnterpriseHtmlEngine(layout, data, debug=args.debug)
    ex = Exporter(layout, data, debug=args.debug)
    ex._html = engine.render()

    out_dir.mkdir(parents=True, exist_ok=True)
    for fmt in formats:
        p = out_dir / f"{stem}.{fmt}"
        try:
            if fmt == "pdf":
                ex.to_pdf(p)
            elif fmt == "html":
                ex.to_html(p)
            elif fmt == "csv":
                ex.to_csv(p)
            elif fmt == "xlsx":
                ex.to_xlsx(p)
            ok(f"{fmt.upper()}: {p}  ({p.stat().st_size:,} bytes)")
        except Exception as e:
            info(f"{fmt.upper()}: skipped — {e}")

    elapsed = (time.perf_counter() - t0) * 1000
    print(f"\n  Done in {elapsed:.0f}ms\n")
