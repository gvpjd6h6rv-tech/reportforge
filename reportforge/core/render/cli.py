#!/usr/bin/env python3
# core/render/cli.py
# ─────────────────────────────────────────────────────────────────
# CLI de ReportForge
#
# Uso:
#   python -m core.render.cli generate --doc-entry 20482
#   python -m core.render.cli generate --doc-entry 20482 --layout layouts/mi.rfd.json
#   python -m core.render.cli preview  --doc-entry 20482
#   python -m core.render.cli info
#
# O con el ejecutable instalado:
#   reportforge generate --doc-entry 20482
# ─────────────────────────────────────────────────────────────────

from __future__ import annotations
import argparse
import json
import sys
import logging
from pathlib import Path


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.WARNING
    logging.basicConfig(
        format="%(levelname)s  %(name)s — %(message)s",
        level=level,
    )


def cmd_generate(args) -> int:
    """Genera un PDF para un doc_entry dado."""
    from .render_engine import RenderEngine, RenderEngineError

    engine = RenderEngine(
        layout_path=args.layout,
        output_dir=args.output_dir,
        debug=args.debug,
    )

    print(f"[ReportForge] Generando factura para doc_entry={args.doc_entry}...")

    try:
        pdf_path = engine.render_invoice(args.doc_entry, args.output)
        print(f"[ReportForge] ✓ PDF generado: {pdf_path}")
        return 0
    except RenderEngineError as e:
        print(f"[ReportForge] ✗ Error: {e}", file=sys.stderr)
        return 1


def cmd_preview(args) -> int:
    """Genera un HTML de preview para un doc_entry dado."""
    from .render_engine import RenderEngine, RenderEngineError

    engine = RenderEngine(
        layout_path=args.layout,
        debug=True,
    )

    try:
        # Intentar con el builder real
        try:
            from core.models.invoice_model import build_invoice_model
            data = build_invoice_model(args.doc_entry)
        except (ImportError, NotImplementedError):
            print("[ReportForge] ⚠ Usando datos de prueba (builder no disponible)")
            data = _sample_data(args.doc_entry)

        html = engine.render_html(data)

        output = Path(args.output or f"preview_{args.doc_entry}.html")
        output.write_text(html, encoding="utf-8")
        print(f"[ReportForge] ✓ Preview HTML: {output}")
        return 0

    except RenderEngineError as e:
        print(f"[ReportForge] ✗ Error: {e}", file=sys.stderr)
        return 1


def cmd_info(args) -> int:
    """Muestra información del engine y dependencias."""
    from .render_engine import RenderEngine
    from .engines.pdf_generator import PdfGenerator

    engine = RenderEngine(layout_path=args.layout)
    info   = engine.info()

    print("\n── ReportForge Engine Info ──────────────────────")
    for k, v in info.items():
        print(f"  {k:<20} {v}")

    wp_ok = PdfGenerator.is_available()
    print(f"\n  {'weasyprint_ok':<20} {'✓' if wp_ok else '✗ pip install weasyprint'}")

    # Verificar builder
    try:
        from core.models.invoice_model import build_invoice_model
        print(f"  {'builder':<20} ✓ core.models.invoice_model")
    except ImportError:
        print(f"  {'builder':<20} ✗ core.models.invoice_model no encontrado")

    print("─────────────────────────────────────────────────\n")
    return 0


def cmd_test(args) -> int:
    """Genera un PDF de prueba con datos sintéticos."""
    from .render_engine import RenderEngine, RenderEngineError

    engine = RenderEngine(
        layout_path=args.layout,
        output_dir=args.output_dir,
        debug=args.debug,
    )

    data = _sample_data(args.doc_entry or 99999)
    print(f"[ReportForge] Generando PDF de prueba con datos sintéticos...")

    try:
        output_file = args.output or f"test_factura_{data['meta']['doc_num']}.pdf"
        pdf_path = engine.render_from_dict(data, output_file)
        print(f"[ReportForge] ✓ PDF de prueba: {pdf_path}")
        return 0
    except RenderEngineError as e:
        print(f"[ReportForge] ✗ Error: {e}", file=sys.stderr)
        return 1


def _sample_data(doc_entry: int = 20482) -> dict:
    """Datos sintéticos que replican la estructura del Modelo Universal."""
    return {
        "meta": {
            "doc_entry":  doc_entry,
            "doc_num":    doc_entry,
            "obj_type":   "13",
            "currency":   "USD",
        },
        "empresa": {
            "razon_social":          "DISTRIBUIDORA EPSON ECUADOR S.A.",
            "nombre_comercial":      "EPSON ECUADOR",
            "ruc":                   "0991234567001",
            "direccion_matriz":      "Av. 9 de Octubre 1234 y Malecón, Guayaquil",
            "direccion_sucursal":    "Cdla. Alborada Mz. 12 Vs. 4, Guayaquil",
            "obligado_contabilidad": "SI",
            "agente_retencion":      "NO",
        },
        "cliente": {
            "razon_social":   "SILVA LEON ROBERTO CARLOS",
            "identificacion": "0923748188",
            "direccion":      "44 Y SEDALANA, Guayaquil",
            "email":          "roberto.silva@email.com",
        },
        "fiscal": {
            "ambiente":               "PRUEBAS",
            "tipo_emision":           "NORMAL",
            "numero_documento":       "002-101-000020482",
            "numero_autorizacion":    "2602202601991234567001120010010000204821234567811",
            "fecha_autorizacion":     "2025-11-19T16:25:46",
            "clave_acceso":           "2602202601991234567001120010010000204821234567811",
        },
        "pago": {
            "group_num":     3,
            "forma_pago_fe": "01",
            "plazo":         None,
            "unidad_tiempo": None,
            "total":         112.00,
            "status":        "MAPPED",
            "source":        "AUT_BY_GROUPNUM",
        },
        "items": [
            {
                "codigo":          "BCANA.12",
                "descripcion":     "CANASTILLA INC. POSTERIOR TAIWAN DINT",
                "cantidad":        30.00,
                "precio_unitario": 0.10,
                "descuento":       0.00,
                "subtotal":        3.00,
            },
            {
                "codigo":          "BCAUC.06",
                "descripcion":     "CAUCHO FRENO REFORZADO TAIWAN 460 CALIPER 56mm",
                "cantidad":        10.00,
                "precio_unitario": 0.37,
                "descuento":       0.00,
                "subtotal":        3.70,
            },
            {
                "codigo":          "BEJE.18",
                "descripcion":     "EJE DEL GRUESO CICISMO FINO TAIWAN (26x14)",
                "cantidad":        6.00,
                "precio_unitario": 0.72,
                "descuento":       0.00,
                "subtotal":        4.32,
            },
            {
                "codigo":          "BEJE.04",
                "descripcion":     "EJE DELANTERO FINO 5/16X148 mm TAIWAN",
                "cantidad":        6.00,
                "precio_unitario": 0.63,
                "descuento":       0.00,
                "subtotal":        3.78,
            },
            {
                "codigo":          "BEJE.02",
                "descripcion":     "EJE POSTERIOR LARGO CINCIN 3/8x168mm TAIWAN",
                "cantidad":        6.00,
                "precio_unitario": 0.82,
                "descuento":       0.00,
                "subtotal":        4.92,
            },
            {
                "codigo":          "BPEDA.12",
                "descripcion":     "PEDAL STD TAIWAN 3657 RECTANGULAR",
                "cantidad":        2.00,
                "precio_unitario": 2.25,
                "descuento":       0.00,
                "subtotal":        4.50,
            },
            {
                "codigo":          "BREQU.02",
                "descripcion":     "REGULACION FRENO EN ORQUÍDEA C/BASE TAIWAN",
                "cantidad":        6.00,
                "precio_unitario": 0.38,
                "descuento":       0.00,
                "subtotal":        2.28,
            },
            {
                "codigo":          "BRULI.07",
                "descripcion":     "RULIMAN 3/8 TAIWAN",
                "cantidad":        3.00,
                "precio_unitario": 0.45,
                "descuento":       0.00,
                "subtotal":        1.35,
            },
            {
                "codigo":          "BTUBO.62",
                "descripcion":     "TUBO 20X2 125 AV DURO TAILANDIA",
                "cantidad":        3.00,
                "precio_unitario": 2.00,
                "descuento":       0.00,
                "subtotal":        6.00,
            },
        ],
        "totales": {
            "subtotal_12":              29.43,
            "subtotal_0":               0.00,
            "subtotal_sin_impuestos":   29.43,
            "iva_12":                   3.53,
            "importe_total":            32.96,
        },
    }


# ── Main ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="reportforge",
        description="ReportForge — Generador de reportes PDF para Linux",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  reportforge generate --doc-entry 20482
  reportforge generate --doc-entry 20482 --layout layouts/factura.rfd.json
  reportforge preview  --doc-entry 20482
  reportforge test
  reportforge info
        """,
    )
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Mostrar logs detallados")

    subparsers = parser.add_subparsers(dest="command", required=True)

    # ── generate ──
    gen = subparsers.add_parser("generate", help="Generar PDF desde doc_entry")
    gen.add_argument("--doc-entry", "-d", type=int, required=True,
                     help="Número de documento en SAP (ej: 20482)")
    gen.add_argument("--layout",    "-l", type=str, default=None,
                     help="Ruta al archivo .rfd.json del Designer")
    gen.add_argument("--output",    "-o", type=str, default=None,
                     help="Nombre del archivo PDF de salida")
    gen.add_argument("--output-dir",     type=str, default="./output",
                     help="Directorio de salida (default: ./output)")
    gen.add_argument("--debug",     action="store_true",
                     help="Añadir bordes de debug al HTML")

    # ── preview ──
    prev = subparsers.add_parser("preview", help="Generar preview HTML")
    prev.add_argument("--doc-entry", "-d", type=int, required=True)
    prev.add_argument("--layout",    "-l", type=str, default=None)
    prev.add_argument("--output",    "-o", type=str, default=None)

    # ── test ──
    tst = subparsers.add_parser("test", help="Generar PDF con datos sintéticos")
    tst.add_argument("--doc-entry", "-d", type=int, default=99999)
    tst.add_argument("--layout",    "-l", type=str, default=None)
    tst.add_argument("--output",    "-o", type=str, default=None)
    tst.add_argument("--output-dir",     type=str, default="./output")
    tst.add_argument("--debug",     action="store_true")

    # ── info ──
    inf = subparsers.add_parser("info", help="Mostrar información del engine")
    inf.add_argument("--layout", "-l", type=str, default=None)

    args = parser.parse_args()
    _setup_logging(args.verbose)

    commands = {
        "generate": cmd_generate,
        "preview":  cmd_preview,
        "test":     cmd_test,
        "info":     cmd_info,
    }

    handler = commands.get(args.command)
    if handler:
        sys.exit(handler(args))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
