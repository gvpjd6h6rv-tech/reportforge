from __future__ import annotations

from pathlib import Path

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
