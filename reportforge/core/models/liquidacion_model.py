# core/models/liquidacion_model.py
# ─────────────────────────────────────────────────────────────────
# Stub para build_liquidacion_model.
#
# Contrato de salida (dict canónico Liquidación de Compras):
# {
#   "meta": {
#     "doc_entry": int,
#     "doc_num":   int,
#     "obj_type":  "18",     # SAP ObjType para A/P Invoice (liq. compras)
#     "currency":  "USD",
#   },
#   "empresa": {             # EMISOR de la liquidación (comprador)
#     "razon_social":          str,
#     "nombre_comercial":      str,
#     "ruc":                   str,
#     "direccion_matriz":      str,
#     "obligado_contabilidad": str,
#   },
#   "proveedor": {           # VENDEDOR (persona natural sin RUC)
#     "razon_social":          str,   # Nombre completo
#     "identificacion":        str,   # Cédula o pasaporte
#     "tipo_identificacion":   str,   # "05"=cédula, "06"=pasaporte
#     "direccion":             str,
#     "email":                 str,
#   },
#   "fiscal": {
#     "ambiente":              str,
#     "tipo_emision":          str,
#     "numero_documento":      str,   # "003-001-000000012"
#     "numero_autorizacion":   str,
#     "fecha_autorizacion":    str,
#     "clave_acceso":          str,
#   },
#   "pago": {
#     "forma_pago_fe": str,
#     "total":         float,
#   },
#   "items": [
#     {
#       "codigo":          str,
#       "descripcion":     str,
#       "cantidad":        float,
#       "unidad_medida":   str,
#       "precio_unitario": float,
#       "descuento":       float,
#       "subtotal":        float,
#     },
#     ...
#   ],
#   "totales": {
#     "subtotal_12":             float,  # Base IVA 12%
#     "subtotal_0":              float,  # Base IVA 0%
#     "subtotal_sin_impuestos":  float,
#     "descuento_total":         float,
#     "iva_12":                  float,
#     "importe_total":           float,
#   },
# }
# ─────────────────────────────────────────────────────────────────


def build_liquidacion_model(doc_entry: int) -> dict:
    """
    Construye el dict canónico de Liquidación de Compras desde SAP B1.

    TODO: implementar conexión SAP B1.
          Consultar: OPCH (A/P Invoice tipo liquidación),
          PCH1 (líneas), OCRD (proveedor persona natural).
          Filtrar por tipo de documento = "03" en la tabla de SRI.

    Args:
        doc_entry: DocEntry del documento en SAP B1.

    Returns:
        dict canónico Liquidación de Compras (ver contrato arriba).
    """
    raise NotImplementedError(
        "build_liquidacion_model no está implementado. "
        "Conecta con SAP B1 y retorna el dict canónico de Liquidación de Compras."
    )
