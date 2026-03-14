# core/models/remision_model.py
# ─────────────────────────────────────────────────────────────────
# Stub para build_remision_model.
# Implementar con la lógica SAP B1 real.
#
# Contrato de salida (dict canónico Guía de Remisión):
# {
#   "meta": {
#     "doc_entry": int,      # DocEntry SAP
#     "doc_num":   int,      # DocNum SAP
#     "obj_type":  "112",    # SAP ObjType para StockTransfer/Delivery
#     "currency":  "USD",
#   },
#   "empresa": {             # Remitente
#     "razon_social": str,
#     "ruc":          str,
#     "direccion":    str,
#     "obligado_contabilidad": str,  # "SI" / "NO"
#   },
#   "destinatario": {
#     "razon_social":    str,
#     "identificacion":  str,        # RUC o cédula
#     "tipo_identificacion": str,    # "04"=RUC, "05"=cédula, "06"=pasaporte
#     "direccion":       str,
#   },
#   "fiscal": {
#     "ambiente":              str,  # "PRUEBAS" / "PRODUCCIÓN"
#     "tipo_emision":          str,  # "NORMAL"
#     "numero_documento":      str,  # "006-001-000000123"
#     "numero_autorizacion":   str,
#     "fecha_autorizacion":    str,  # ISO datetime
#     "clave_acceso":          str,  # 49 dígitos
#   },
#   "traslado": {
#     "motivo":                str,  # "VENTA", "COMPRA", "DEVOLUCIÓN", etc.
#     "ruta":                  str,  # "Guayaquil - Quito"
#     "fecha_inicio_traslado": str,  # "DD/MM/YYYY"
#     "fecha_fin_traslado":    str,  # "DD/MM/YYYY"
#     "placa_vehiculo":        str,
#     "transportista_ruc":     str,
#     "transportista_nombre":  str,
#   },
#   "origen": {
#     "direccion":    str,
#     "establecimiento_salida": str,  # código establecimiento SRI
#   },
#   "destino": {
#     "direccion":    str,
#     "establecimiento_destino": str,
#   },
#   "items": [
#     {
#       "codigo":        str,
#       "descripcion":   str,
#       "cantidad":      float,
#       "unidad_medida": str,   # "KG", "UN", "LT", etc.
#     },
#     ...
#   ],
# }
# ─────────────────────────────────────────────────────────────────


def build_remision_model(doc_entry: int) -> dict:
    """
    Construye el dict canónico de Guía de Remisión desde SAP B1.

    TODO: implementar conexión SAP B1.
          Consultar: ODLN (Delivery), ORDR (Sales Order),
          OWHS (warehouses), OITM (items).

    Args:
        doc_entry: DocEntry del documento en SAP B1.

    Returns:
        dict canónico Guía de Remisión (ver contrato arriba).
    """
    raise NotImplementedError(
        "build_remision_model no está implementado. "
        "Conecta con SAP B1 y retorna el dict canónico de Guía de Remisión."
    )
