# core/models/invoice_model.py
# ─────────────────────────────────────────────────────────────────
# ARCHIVO EXISTENTE — No se modifica.
# El RenderEngine lo importa tal cual.
# ─────────────────────────────────────────────────────────────────
#
# Contrato garantizado por build_invoice_model:
#
#   from core.models.invoice_model import build_invoice_model
#   data = build_invoice_model(doc_entry=20482)
#   assert isinstance(data, dict)
#
# Claves de primer nivel garantizadas:
#   data["meta"]     → doc_entry, doc_num, obj_type, currency
#   data["empresa"]  → razon_social, ruc, direcciones
#   data["cliente"]  → razon_social, identificacion, direccion, email
#   data["fiscal"]   → numero_documento, clave_acceso, ambiente, ...
#   data["pago"]     → forma_pago_fe, total, plazo, ...
#   data["items"]    → list[dict] con codigo, descripcion, cantidad,
#                       precio_unitario, descuento, subtotal
#   data["totales"]  → subtotal_12, subtotal_0, iva_12, importe_total
#
# ─────────────────────────────────────────────────────────────────


def build_invoice_model(doc_entry: int) -> dict:
    """
    Builder Universal — retorna el Modelo Canónico de Factura.
    Esta función existe en tu proyecto. El RenderEngine la llama
    directamente sin modificarla.
    """
    # Tu implementación real va aquí.
    # Este stub es solo para que los tests y el render engine
    # puedan importar sin el sistema SAP conectado.
    raise NotImplementedError(
        "build_invoice_model debe ser implementado en tu proyecto. "
        "Este archivo es un stub de referencia."
    )
