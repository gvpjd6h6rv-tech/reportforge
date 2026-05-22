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
    "empresa": {
        "razon_social": "DISTRIBUIDORA DEMO S.A.",
        "ruc": "1791234560001",
        "direccion_matriz": "Av. Principal 123, Quito",
        "obligado_contabilidad": "SI",
    },
    "cliente": {
        "razon_social": "Cliente Demo Corp",
        "identificacion": "0987654321001",
        "direccion": "Calle Secundaria 456",
    },
    "fiscal": {
        "numero_documento": "001-001-000000042",
        "ambiente": "PRUEBAS",
        "fecha_autorizacion": "2024-06-01T10:30:00",
        "clave_acceso": "0102202401179123456000110010010000000421234567813",
    },
    "totales": {
        "subtotal_12": 892.86,
        "subtotal_0": 0.0,
        "subtotal_sin_impuestos": 892.86,
        "iva_12": 107.14,
        "importe_total": 1000.00,
    },
    "meta": {"doc_num": "001-001-000000042", "currency": "USD"},
    "items": [
        {"item": {"codigo": "PROD-001", "descripcion": "Laptop Dell XPS 15",
                  "cantidad": 2.0, "precio_unitario": 350.00, "descuento": 0.0, "subtotal": 700.00}},
        {"item": {"codigo": "PROD-002", "descripcion": "Monitor Samsung 27\"",
                  "cantidad": 1.0, "precio_unitario": 192.86, "descuento": 0.0, "subtotal": 192.86}},
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
