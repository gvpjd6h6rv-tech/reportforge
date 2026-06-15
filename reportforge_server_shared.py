from __future__ import annotations

import datetime as _dt
import subprocess as _subprocess
from pathlib import Path
from functools import lru_cache

_HERE = Path(__file__).parent
_DESIGNER_HTML = _HERE / "designer" / "crystal-reports-designer-v4.html"
_DESIGNER_HTML_V3 = _HERE / "designer" / "crystal-reports-designer-v3.html"
_DESIGNER_SRC = _HERE / "reportforge" / "designer"

_DEMO_DATA = {
    "empresa_razon_social": "DISTRIBUIDORA EPSON ECUADOR S.A.",
    "empresa_ruc": "0991234567001",
    "empresa_direccion_matriz": "Av. Principal 123 y Malecón, Guayaquil",
    "empresa_direccion_sucursal": "Av. Amazonas 12 Vs. 4, Guayaquil",
    "empresa_obligado_contabilidad": "SI",
    "empresa_agente_retencion": "NO",
    "empresa_telefono": "2530152",
    "empresa_correo": "supermotosybicicletas@gmail.com",

    "fiscal_numero_documento": "002-101-000020482",
    "fiscal_numero_autorizacion": "2602202601091234567001120021010000204821234567818",
    "fiscal_clave_acceso": "2602202601091234567001120021010000204821234567818",
    "fiscal_fecha_autorizacion": "2026-02-26T09:32:10-05:00",
    "fiscal_ambiente": "PRUEBAS",
    "fiscal_emision": "NORMAL",

    "cliente_razon_social": "SILVA LEON ROBERTO CARLOS",
    "cliente_identificacion": "0923748188",
    "cliente_telefono": "S/N",
    "cliente_email": "roberto.silva@email.com",
    "cliente_direccion": "44 Y SEDALANA, Guayaquil",

    "fecha_emision": "26/02/2026",
    "guia_remision": "",
    "observaciones": "N/A",

    "forma_pago_descripcion": "Sin Utilización del Sistema Financiero",
    "forma_pago_valor": 33.84,
    "forma_pago_plazo": "",
    "forma_pago_tiempo": "",

    "totales_subtotal_15": 29.43,
    "totales_subtotal_iva_0": 0.00,
    "totales_subtotal_no_objeto_iva": 0.00,
    "totales_subtotal_exento_iva": 0.00,
    "totales_subtotal_sin_impuestos": 29.43,
    "totales_descuento_total": 0.00,
    "totales_valor_ice": 0.00,
    "totales_iva_15": 4.41,
    "totales_propina": 0.00,
    "totales_valor_total": 33.84,

    "empresa": {
        "razon_social": "DISTRIBUIDORA EPSON ECUADOR S.A.",
        "ruc": "0991234567001",
        "direccion_matriz": "Av. Principal 123 y Malecón, Guayaquil",
        "direccion_sucursal": "Av. Amazonas 12 Vs. 4, Guayaquil",
        "obligado_contabilidad": "SI",
        "agente_retencion": "NO",
        "telefono": "2530152",
        "correo": "supermotosybicicletas@gmail.com",
    },
    "cliente": {
        "razon_social": "SILVA LEON ROBERTO CARLOS",
        "identificacion": "0923748188",
        "telefono": "S/N",
        "email": "roberto.silva@email.com",
        "direccion": "44 Y SEDALANA, Guayaquil",
    },
    "fiscal": {
        "numero_documento": "002-101-000020482",
        "numero_autorizacion": "2602202601091234567001120021010000204821234567818",
        "clave_acceso": "2602202601091234567001120021010000204821234567818",
        "fecha_autorizacion": "2026-02-26T09:32:10-05:00",
        "ambiente": "PRUEBAS",
        "emision": "NORMAL",
    },
    "forma_pago": {
        "descripcion": "Sin Utilización del Sistema Financiero",
        "valor": 33.84,
        "plazo": "",
        "tiempo": "",
    },
    "totales": {
        "subtotal_15": 29.43,
        "subtotal_iva_0": 0.00,
        "subtotal_no_objeto_iva": 0.00,
        "subtotal_exento_iva": 0.00,
        "subtotal_sin_impuestos": 29.43,
        "descuento_total": 0.00,
        "valor_ice": 0.00,
        "iva_15": 4.41,
        "propina": 0.00,
        "valor_total": 33.84,
        "importe_total": 33.84,
    },
    "meta": {"doc_num": "002-101-000020482", "currency": "USD"},
    "items": [
        {
            "codigo": "BTUB0.62",
            "descripcion": "TUBO 20x2 125 AV DURO TAILANDIA",
            "cantidad": 3.0,
            "precio_unitario": 2.0,
            "descuento": 0.0,
            "subtotal": 6.0,
        },
        {
            "codigo": "BCANA.12",
            "descripcion": "CANASTILLA INOX. POSTERIOR TAIWAN DIN",
            "cantidad": 30.0,
            "precio_unitario": 0.1,
            "descuento": 0.0,
            "subtotal": 3.0,
        },
    ],
}



@lru_cache(maxsize=1)
def _git_short_commit() -> str:
    try:
        out = _subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=_HERE,
            stderr=_subprocess.DEVNULL,
            text=True,
        ).strip()
        return out or "unknown"
    except Exception:
        return "unknown"


def _fmt_ts(path: Path) -> str:
    try:
        dt = _dt.datetime.fromtimestamp(path.stat().st_mtime, tz=_dt.timezone.utc)
        return dt.astimezone().isoformat(timespec="seconds")
    except Exception:
        return "unknown"


def get_designer_build_info() -> dict[str, str]:
    html_path = _DESIGNER_HTML if _DESIGNER_HTML.exists() else _DESIGNER_HTML_V3
    zoom_js = _HERE / "engines" / "ZoomEngine.js"
    return {
        "commit": _git_short_commit(),
        "assetVersion": _fmt_ts(html_path),
        "htmlTimestamp": _fmt_ts(html_path),
        "jsTimestamp": _fmt_ts(zoom_js),
        "jsRoute": "/engines/ZoomEngine.js",
        "htmlRoute": "/designer/crystal-reports-designer-v4.html" if _DESIGNER_HTML.exists() else "/designer/crystal-reports-designer-v3.html",
        "cacheStatus": "no-store",
    }
