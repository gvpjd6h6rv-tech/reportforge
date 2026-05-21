from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

RF_ROOT = Path(__file__).resolve().parents[2]
if str(RF_ROOT) not in sys.path:
    sys.path.insert(0, str(RF_ROOT))

from reportforge.core.render.engines.advanced_engine import render_advanced  # noqa: E402
from reportforge.core.render.engines.pdf_generator import PdfGenerator  # noqa: E402

DEFAULT_PRINTER = "EPSON_L3250_Series_398EC3"
LAYOUT_DIR = RF_ROOT / "reportforge" / "layouts"


class OperationalDocsError(RuntimeError):
    pass


def _layout_path(doc_type: str) -> Path:
    path = LAYOUT_DIR / f"{doc_type}.json"
    if not path.exists():
        raise OperationalDocsError(f"layout not found: {path}")
    return path


def _load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _dump_json(data: Any, path: str | Path) -> Path:
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return out


def build_factura_a4_data(model: dict[str, Any]) -> dict[str, Any]:
    empresa = dict(model.get("empresa") or {})
    cliente = dict(model.get("cliente") or {})
    meta = dict(model.get("meta") or {})
    fiscal = dict(model.get("fiscal") or {})
    pago = dict(model.get("pago") or {})
    totales = dict(model.get("totales") or {})
    obs = dict(model.get("observaciones") or {})

    items: list[dict[str, Any]] = []
    for item in model.get("items") or []:
        item = dict(item or {})
        items.append(
            {
                "codigo": str(item.get("codigo") or item.get("cod") or item.get("ItemCode") or "").strip(),
                "descripcion": str(item.get("descripcion") or item.get("desc") or item.get("ItemDescription") or "").strip(),
                "cantidad": item.get("cantidad") if item.get("cantidad") is not None else item.get("qty"),
                "precio_unitario": item.get("precio_unitario") if item.get("precio_unitario") is not None else item.get("price_unit"),
                "descuento": item.get("descuento") if item.get("descuento") is not None else item.get("discount"),
                "subtotal": item.get("subtotal") if item.get("subtotal") is not None else item.get("total"),
            }
        )

    def _pick(*values: Any) -> str:
        for value in values:
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
        return ""

    return {
        "empresa_razon_social": _pick(empresa.get("razon_social"), empresa.get("nombre"), empresa.get("name")),
        "empresa_ruc": _pick(empresa.get("ruc"), empresa.get("tax_id")),
        "empresa_direccion_matriz": _pick(empresa.get("direccion_matriz"), empresa.get("direccion")),
        "empresa_direccion_sucursal": _pick(empresa.get("direccion_sucursal"), empresa.get("direccion")),
        "empresa_obligado_contabilidad": _pick(empresa.get("obligado_contabilidad"), empresa.get("obligado")),
        "empresa_agente_retencion": _pick(empresa.get("agente_retencion"), empresa.get("retencion")),
        "empresa_telefono": _pick(empresa.get("telefono")),
        "empresa_correo": _pick(empresa.get("correo"), empresa.get("email")),
        "empresa_nombre_comercial": _pick(empresa.get("nombre_comercial")),
        "cliente_razon_social": _pick(cliente.get("razon_social"), cliente.get("nombre")),
        "cliente_identificacion": _pick(cliente.get("identificacion"), cliente.get("ruc")),
        "cliente_direccion": _pick(cliente.get("direccion")),
        "cliente_telefono": _pick(cliente.get("telefono")),
        "cliente_email": _pick(cliente.get("correo"), cliente.get("email")),
        "fiscal_numero_documento": _pick(fiscal.get("numero_documento"), meta.get("numero_documento"), meta.get("invoice_number")),
        "fiscal_numero_autorizacion": _pick(fiscal.get("numero_autorizacion"), meta.get("numero_autorizacion")),
        "fiscal_fecha_autorizacion": _pick(fiscal.get("fecha_autorizacion")),
        "fiscal_ambiente": _pick(fiscal.get("ambiente")),
        "fiscal_emision": _pick(fiscal.get("tipo_emision"), fiscal.get("emision")),
        "fiscal_clave_acceso": _pick(fiscal.get("clave_acceso")),
        "fecha_emision": _pick(meta.get("doc_date"), fiscal.get("fecha_emision")),
        "fiscal_correo": _pick(fiscal.get("correo")),
        "guia_remision": _pick(fiscal.get("guia_remision")),
        "items": items,
        "totales_subtotal_15": totales.get("subtotal_15", totales.get("subtotal")),
        "totales_subtotal_iva_0": totales.get("subtotal_iva_0", 0),
        "totales_subtotal_no_objeto_iva": totales.get("subtotal_no_objeto_iva", 0),
        "totales_subtotal_exento_iva": totales.get("subtotal_exento_iva", 0),
        "totales_subtotal_sin_impuestos": totales.get("subtotal_sin_impuestos", totales.get("subtotal")),
        "totales_descuento_total": totales.get("descuento_total", 0),
        "totales_valor_ice": totales.get("valor_ice", 0),
        "totales_iva_15": totales.get("iva_15", totales.get("iva")),
        "totales_propina": totales.get("propina", 0),
        "totales_valor_total": totales.get("valor_total", totales.get("total")),
        "forma_pago_descripcion": _pick(pago.get("descripcion"), pago.get("forma_pago")),
        "forma_pago_valor": pago.get("valor", totales.get("valor_total", totales.get("total"))),
        "forma_pago_plazo": _pick(pago.get("plazo")),
        "forma_pago_tiempo": _pick(pago.get("tiempo")),
        "informacion_adicional": obs.get("informacion_adicional") if isinstance(obs.get("informacion_adicional"), dict) else {},
        "observaciones": _pick(obs.get("texto"), obs.get("comentario"), model.get("comentarios"), meta.get("comments")),
        "meta_doc_num": _pick(meta.get("doc_num"), meta.get("doc_entry")),
        "meta_doc_entry": meta.get("doc_entry"),
        "meta_currency": _pick(meta.get("currency")),
    }


def build_guia_remision_a4_data(model: dict[str, Any]) -> dict[str, Any]:
    guia = dict(model.get("guia_remision") or {})
    empresa = dict(model.get("empresa") or {})
    destinatario = dict(guia.get("destinatario") or model.get("destinatario") or {})
    traslado = dict(guia.get("traslado") or model.get("traslado") or {})
    origen = dict(guia.get("origen") or model.get("origen") or {})
    destino = dict(guia.get("destino") or model.get("destino") or {})
    fiscal = dict(guia.get("fiscal") or model.get("fiscal") or {})
    meta = dict(model.get("meta") or {})

    items: list[dict[str, Any]] = []
    for item in (guia.get("items") or model.get("items") or []):
        item = dict(item or {})
        items.append(
            {
                "codigo": str(item.get("codigo") or item.get("ItemCode") or "").strip(),
                "descripcion": str(item.get("descripcion") or item.get("ItemDescription") or item.get("ItemName") or "").strip(),
                "cantidad": item.get("cantidad") if item.get("cantidad") is not None else item.get("Quantity"),
                "unidad_medida": str(item.get("unidad_medida") or item.get("u_medida") or item.get("Unit") or "").strip(),
            }
        )

    def _pick(*values: Any) -> str:
        for value in values:
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
        return ""

    return {
        "empresa_razon_social": _pick(empresa.get("razon_social"), empresa.get("nombre")),
        "empresa_ruc": _pick(empresa.get("ruc")),
        "empresa_direccion": _pick(empresa.get("direccion"), empresa.get("direccion_matriz")),
        "empresa_telefono": _pick(empresa.get("telefono")),
        "empresa_correo": _pick(empresa.get("correo"), empresa.get("email")),
        "destinatario_razon_social": _pick(destinatario.get("razon_social"), destinatario.get("nombre")),
        "destinatario_identificacion": _pick(destinatario.get("identificacion")),
        "destinatario_direccion": _pick(destinatario.get("direccion")),
        "traslado_motivo": _pick(traslado.get("motivo")),
        "traslado_ruta": _pick(traslado.get("ruta")),
        "traslado_fecha_inicio": _pick(traslado.get("fecha_inicio_traslado"), traslado.get("fecha_inicio")),
        "traslado_fecha_fin": _pick(traslado.get("fecha_fin_traslado"), traslado.get("fecha_fin")),
        "traslado_placa": _pick(traslado.get("placa_vehiculo"), traslado.get("placa")),
        "traslado_transportista_nombre": _pick(traslado.get("transportista_nombre")),
        "traslado_transportista_ruc": _pick(traslado.get("transportista_ruc")),
        "origen_direccion": _pick(origen.get("direccion")),
        "destino_direccion": _pick(destino.get("direccion")),
        "fiscal_numero_documento": _pick(fiscal.get("numero_documento")),
        "fiscal_numero_autorizacion": _pick(fiscal.get("numero_autorizacion")),
        "fiscal_fecha_autorizacion": _pick(fiscal.get("fecha_autorizacion")),
        "fiscal_ambiente": _pick(fiscal.get("ambiente")),
        "fiscal_emision": _pick(fiscal.get("tipo_emision"), fiscal.get("emision")),
        "fiscal_clave_acceso": _pick(fiscal.get("clave_acceso")),
        "items": items,
        "observaciones": _pick(guia.get("observaciones"), model.get("observaciones")),
        "meta_doc_num": _pick(meta.get("doc_num"), meta.get("doc_entry")),
    }


def render_document_html(doc_type: str, data: dict[str, Any], *, layout_path: str | Path | None = None, debug: bool = False) -> str:
    lp = Path(layout_path) if layout_path else _layout_path(doc_type)
    raw = json.loads(lp.read_text(encoding="utf-8"))
    return render_advanced(raw, data, debug=debug)


def render_document_pdf(doc_type: str, data: dict[str, Any], *, layout_path: str | Path | None = None, debug: bool = False) -> bytes:
    lp = Path(layout_path) if layout_path else _layout_path(doc_type)
    html = render_document_html(doc_type, data, layout_path=lp, debug=debug)
    return PdfGenerator(base_url=str(lp.parent)).from_html(html)


def render_document_file(
    doc_type: str,
    data: dict[str, Any],
    *,
    output_path: str | Path,
    layout_path: str | Path | None = None,
    debug: bool = False,
) -> Path:
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(render_document_pdf(doc_type, data, layout_path=layout_path, debug=debug))
    return out


def print_pdf(pdf_path: str | Path, printer: str | None = None) -> tuple[bool, str]:
    cmd = ["lp"]
    if printer:
        cmd.extend(["-d", str(printer)])
    cmd.append(str(pdf_path))
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    combined = "\n".join(x for x in [proc.stdout.strip(), proc.stderr.strip()] if x).strip()
    if proc.returncode != 0:
        return False, combined or f"lp exited with {proc.returncode}"
    return True, combined or "ok"


def render_and_print(
    doc_type: str,
    data: dict[str, Any],
    *,
    output_path: str | Path | None = None,
    output_dir: str | Path = "/tmp",
    printer: str | None = None,
    layout_path: str | Path | None = None,
    debug: bool = False,
) -> dict[str, Any]:
    out = Path(output_path) if output_path else Path(output_dir) / f"{doc_type}.pdf"
    pdf_path = render_document_file(doc_type, data, output_path=out, layout_path=layout_path, debug=debug)
    printed = False
    print_message = ""
    if printer is not None:
        printed, print_message = print_pdf(pdf_path, printer=printer or DEFAULT_PRINTER)
    return {
        "ok": True,
        "pdf_path": str(pdf_path),
        "printed": printed,
        "printer": printer or DEFAULT_PRINTER,
        "print_message": print_message,
    }


def _cmd_render(args: argparse.Namespace) -> int:
    data = _load_json(args.data)
    result = render_and_print(
        args.doc_type,
        data,
        output_path=args.output,
        output_dir=args.output_dir,
        printer=None,
        layout_path=args.layout,
        debug=args.debug,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def _cmd_print(args: argparse.Namespace) -> int:
    ok, message = print_pdf(args.pdf, printer=args.printer)
    payload = {"ok": ok, "message": message, "printer": args.printer or DEFAULT_PRINTER, "pdf": str(args.pdf)}
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0 if ok else 1


def _cmd_preview(args: argparse.Namespace) -> int:
    data = _load_json(args.data)
    html = render_document_html(args.doc_type, data, layout_path=args.layout, debug=args.debug)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(json.dumps({"ok": True, "output": str(out), "bytes": len(html)}, indent=2, ensure_ascii=False))
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ReportForge operational document helper")
    sub = parser.add_subparsers(dest="command", required=True)

    p_render = sub.add_parser("render", help="Render operational document to PDF")
    p_render.add_argument("doc_type", choices=("factura_a4", "guia_remision_a4"))
    p_render.add_argument("--data", required=True, help="Path to JSON data")
    p_render.add_argument("--output", help="Output PDF path")
    p_render.add_argument("--output-dir", default="/tmp", help="Directory used when --output is omitted")
    p_render.add_argument("--layout", help="Override layout path")
    p_render.add_argument("--debug", action="store_true")
    p_render.set_defaults(func=_cmd_render)

    p_print = sub.add_parser("print", help="Send a PDF to CUPS")
    p_print.add_argument("pdf", help="PDF path")
    p_print.add_argument("--printer", help="Optional printer name")
    p_print.set_defaults(func=_cmd_print)

    p_preview = sub.add_parser("preview", help="Render HTML preview for a document")
    p_preview.add_argument("doc_type", choices=("factura_a4", "guia_remision_a4"))
    p_preview.add_argument("--data", required=True, help="Path to JSON data")
    p_preview.add_argument("--output", required=True, help="HTML output path")
    p_preview.add_argument("--layout", help="Override layout path")
    p_preview.add_argument("--debug", action="store_true")
    p_preview.set_defaults(func=_cmd_preview)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
