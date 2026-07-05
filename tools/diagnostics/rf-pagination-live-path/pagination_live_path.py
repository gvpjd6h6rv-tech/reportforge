#!/usr/bin/env python3
"""RF Pagination Live-Path Diagnostic (Bug A: preview vs exported PDF).

Diagnostic-only. Proves — against the REAL running reportforge_server.py, not
a fresh in-process engine import — whether the visible preview page count
(`/designer-preview` -> AdvancedHtmlEngine HTML -> N `.rpt-page` divs) matches
the exported PDF's physical page count (`/render` {format:pdf} -> WeasyPrint).

Why the LIVE server matters (forensic #10.7R):
- Both `/designer-preview` (visible preview render-layer) and `/render`
  (the "Exportar a PDF" button) POST the SAME {layout,data} to the SAME
  AdvancedHtmlEngine. They can only diverge when ONE `.rpt-page` div is
  taller than the physical @page box and WeasyPrint splits it -> preview
  shows N divs, PDF shows N+1 physical pages.
- advanced_engine.py is a SERVER-side module. Editing it does nothing until
  reportforge_server.py is RESTARTED (the process caches the module in
  memory). A fresh pytest/engine import ALWAYS loads the new code, so
  green unit tests can mask a live bug that a human hits on a stale server.
  This tool talks to the actual running server, so it reflects what the
  human sees. ALWAYS restart the server before trusting a "fixed" result.

Usage:
  python3 pagination_live_path.py --layout <layout.json> [--port 5001] \
      [--items 10,20,30,40,50] [--outdir /tmp/rf-pagination-live-path]

If --items is omitted it sweeps a default range to locate the divergence
boundary. Detail-section fieldPaths are read from the layout so the synthetic
sample data matches. Exit code 1 if any divergence (preview != PDF) is found.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.request
from pathlib import Path


def _post(port: int, path: str, payload: dict) -> bytes:
    req = urllib.request.Request(
        f"http://localhost:{port}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    return urllib.request.urlopen(req, timeout=60).read()


def _detail_fieldpaths(layout: dict) -> list[str]:
    det_ids = {s["id"] for s in layout.get("sections", []) if s.get("stype") == "det"}
    keys = []
    for e in layout.get("elements", []):
        if e.get("sectionId") in det_ids and e.get("fieldPath"):
            keys.append(e["fieldPath"].split(".", 1)[-1])
    return keys or ["codigo", "descripcion"]


def _make_items(n: int, keys: list[str]) -> list[dict]:
    out = []
    for i in range(n):
        row = {}
        for k in keys:
            row[k] = float(i + 1) if k in ("cantidad", "qty") else f"{k.upper()} {i}"
        out.append(row)
    return out


def _pdf_pages(pdf_path: Path) -> int:
    res = subprocess.run(["pdfinfo", str(pdf_path)], capture_output=True, text=True)
    return int(res.stdout.split("Pages:")[1].split()[0])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--layout", required=True, help="path to layout .json")
    ap.add_argument("--port", type=int, default=5001)
    ap.add_argument("--items", default="", help="comma-separated item counts; empty = sweep")
    ap.add_argument("--outdir", default="/tmp/rf-pagination-live-path")
    args = ap.parse_args(argv)

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    layout = json.loads(Path(args.layout).read_text())
    keys = _detail_fieldpaths(layout)

    try:
        _post(args.port, "/health", {})
    except Exception:
        # /health is GET; a failed POST still proves reachability differently
        try:
            urllib.request.urlopen(f"http://localhost:{args.port}/health", timeout=5)
        except Exception as exc:
            print(f"ERROR: no live server on :{args.port} ({exc}). Start it with run.sh.")
            return 2

    counts = [int(x) for x in args.items.split(",") if x.strip()] or [10, 20, 30, 40, 45, 50, 55]
    print(f"layout={args.layout}  port={args.port}  detail keys={keys}")
    print(f"{'items':>6} {'preview_divs':>12} {'pdf_pages':>9}  {'result':>8}")
    any_divergence = False
    for n in counts:
        data = {"items": _make_items(n, keys), "observaciones": "diagnostic"}
        html = _post(args.port, "/designer-preview", {"layout": layout, "data": data}).decode("utf-8", "replace")
        divs = html.count('class="rpt-page"')
        pdf_bytes = _post(args.port, "/render", {"layout": layout, "data": data, "format": "pdf"})
        pdf_path = outdir / f"render_{n}.pdf"
        pdf_path.write_bytes(pdf_bytes)
        pages = _pdf_pages(pdf_path)
        ok = divs == pages
        any_divergence = any_divergence or not ok
        print(f"{n:>6} {divs:>12} {pages:>9}  {'OK' if ok else 'DIVERGE':>8}")

    if any_divergence:
        print("\nRESULT: preview .rpt-page count != PDF physical pages for some item count.")
        print("If you just applied a fix, RESTART reportforge_server.py and re-run.")
        return 1
    print("\nRESULT: preview == PDF at all tested item counts.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
