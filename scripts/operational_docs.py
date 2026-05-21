#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.doc_registry import get_doc_type
from reportforge.core.render.engines.html_engine import HtmlEngine
from reportforge.core.render.engines.pdf_generator import PdfGenerator
from reportforge.core.render.resolvers.field_resolver import FieldResolver
from reportforge.core.render.resolvers.layout_loader import load_layout

FACTURA_LAYOUT = ROOT / "reportforge" / "layouts" / "factura-electronica.rfd.json"
FACTURA_SAMPLE = ROOT / "examples" / "factura_sample.json"
REMISION_SAMPLE = ROOT / "examples" / "remision_sample.json"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sample_path(doc_type: str) -> Path:
    if doc_type == "factura":
        return FACTURA_SAMPLE
    if doc_type == "remision":
        return REMISION_SAMPLE
    raise KeyError(doc_type)


def layout_for(doc_type: str):
    if doc_type == "factura":
        return load_layout(FACTURA_LAYOUT)
    if doc_type == "remision":
        return get_doc_type("remision").default_layout()
    raise KeyError(doc_type)


def render_pdf(doc_type: str, out_dir: Path) -> Path:
    data = load_json(sample_path(doc_type))
    layout = layout_for(doc_type)
    html = HtmlEngine(layout, FieldResolver(data)).render()
    pdf_path = out_dir / f"{doc_type}.pdf"
    PdfGenerator(base_url=str(ROOT)).from_html_to_file(html, pdf_path)
    return pdf_path


def inspect_pdf(pdf_path: Path) -> str:
    if shutil.which("pdfinfo"):
        proc = subprocess.run(
            ["pdfinfo", str(pdf_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        for line in proc.stdout.splitlines():
            if line.startswith("Page size:"):
                return line.strip()
    return "Page size: unavailable"


def detect_printer_state() -> dict:
    lp = shutil.which("lp")
    lpr = shutil.which("lpr")
    lpstat = shutil.which("lpstat")
    printers: list[str] = []
    default_printer: str | None = None

    if lpstat:
        try:
            out = subprocess.run(["lpstat", "-e"], check=True, capture_output=True, text=True).stdout
            printers = [line.strip() for line in out.splitlines() if line.strip()]
        except subprocess.CalledProcessError:
            printers = []
        try:
            out = subprocess.run(["lpstat", "-d"], check=True, capture_output=True, text=True).stdout.strip()
            if ":" in out:
                default_printer = out.split(":", 1)[1].strip()
        except subprocess.CalledProcessError:
            default_printer = None

    return {
        "lp": lp,
        "lpr": lpr,
        "lpstat": lpstat,
        "printers": printers,
        "default_printer": default_printer,
    }


def print_pdf(pdf_path: Path, printer: str | None = None) -> str:
    state = detect_printer_state()
    printers = state["printers"]
    if not state["lp"] and not state["lpr"]:
        return "No hay comando lp/lpr instalado."
    if not printers and not printer:
        return "No hay impresoras configuradas en CUPS."

    target = printer or state["default_printer"] or (printers[0] if printers else "default")

    if state["lp"]:
        cmd = ["lp"]
        if printer:
            cmd += ["-d", printer]
        cmd.append(str(pdf_path))
    else:
        cmd = ["lpr"]
        if printer:
            cmd += ["-P", printer]
        cmd.append(str(pdf_path))

    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        return f"Enviado a impresora: {target}"
    except subprocess.CalledProcessError:
        return f"No se pudo imprimir en {target}. PDF generado en {pdf_path}."


def run_build(doc_type: str, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = render_pdf(doc_type, out_dir)
    print(f"{doc_type}: {pdf_path}")
    print(inspect_pdf(pdf_path))


def run_print(doc_type: str, out_dir: Path, printer: str | None) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = render_pdf(doc_type, out_dir)
    print(f"{doc_type}: {pdf_path}")
    print(inspect_pdf(pdf_path))
    print(print_pdf(pdf_path, printer=printer))


def cmd_build(args: argparse.Namespace) -> None:
    if args.doc_type == "all":
        run_build("factura", args.out_dir)
        run_build("remision", args.out_dir)
        return
    run_build(args.doc_type, args.out_dir)


def cmd_print(args: argparse.Namespace) -> None:
    if args.doc_type == "all":
        run_print("factura", args.out_dir, args.printer)
        run_print("remision", args.out_dir, args.printer)
        return
    run_print(args.doc_type, args.out_dir, args.printer)


def cmd_status(args: argparse.Namespace) -> None:
    state = detect_printer_state()
    print("WeasyPrint:", "ok" if PdfGenerator.is_available() else "missing")
    print("lp:", state["lp"] or "missing")
    print("lpr:", state["lpr"] or "missing")
    print("lpstat:", state["lpstat"] or "missing")
    print("printers:", ", ".join(state["printers"]) if state["printers"] else "none")
    print("default:", state["default_printer"] or "none")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Flujo operativo local para factura y guía de remisión A4."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_build = sub.add_parser("build", help="Genera PDF A4 desde samples")
    p_build.add_argument("doc_type", choices=["factura", "remision", "all"])
    p_build.add_argument("--out-dir", default="out", type=Path)
    p_build.set_defaults(func=cmd_build)

    p_print = sub.add_parser("print", help="Genera e imprime PDF A4 si hay CUPS")
    p_print.add_argument("doc_type", choices=["factura", "remision", "all"])
    p_print.add_argument("--out-dir", default="out", type=Path)
    p_print.add_argument("--printer", default=None)
    p_print.set_defaults(func=cmd_print)

    p_status = sub.add_parser("status", help="Diagnóstico de WeasyPrint e impresión")
    p_status.set_defaults(func=cmd_status)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
