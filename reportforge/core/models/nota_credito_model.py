# core/models/nota_credito_model.py
# ─────────────────────────────────────────────────────────────────
# Stub para build_nota_credito_model.
#
# Contrato de salida (dict canónico Nota de Crédito Cliente):
# {
#   "meta": {
#     "doc_entry": int,
#     "doc_num":   int,
#     "obj_type":  "14",     # SAP ObjType para Credit Note
#     "currency":  "USD",
#   },
#   "empresa": {             # Emisor
#     "razon_social": str,
#     "nombre_comercial": str,
#     "ruc":          str,
#     "direccion_matriz": str,
#     "obligado_contabilidad": str,
#     "agente_retencion":      str,
#   },
#   "cliente": {
#     "razon_social":   str,
#     "identificacion": str,
#     "tipo_identificacion": str,
#     "direccion":      str,
#     "email":          str,
#   },
#   "fiscal": {
#     "ambiente":              str,
#     "tipo_emision":          str,
#     "numero_documento":      str,  # "004-001-000000045"
#     "numero_autorizacion":   str,
#     "fecha_autorizacion":    str,
#     "clave_acceso":          str,
#   },
#   "doc_modificado": {      # Documento original al que aplica esta NC
#     "numero_documento":      str,  # "001-001-000020482"
#     "fecha_emision":         str,
#     "tipo_documento":        str,  # "FACTURA", "LIQUIDACIÓN", etc.
#   },
#   "motivo": str,           # Razón de la nota de crédito
#   "pago": {
#     "forma_pago_fe": str,
#     "total":         float,
#   },
#   "items": [
#     {
#       "codigo":          str,
#       "descripcion":     str,
#       "cantidad":        float,
#       "precio_unitario": float,
#       "descuento":       float,
#       "subtotal":        float,
#     },
#     ...
#   ],
#   "totales": {
#     "subtotal_12":             float,
#     "subtotal_0":              float,
#     "subtotal_sin_impuestos":  float,
#     "descuento_total":         float,
#     "iva_12":                  float,
#     "importe_total":           float,
#   },
# }
# ─────────────────────────────────────────────────────────────────


def build_nota_credito_model(doc_entry: int) -> dict:
    """
    Construye el dict canónico de Nota de Crédito desde SAP B1.

    TODO: implementar conexión SAP B1.
          Consultar: ORIN (Credit Note), RIN1 (líneas),
          OINV (Invoice origen), referencias cruzadas.

    Args:
        doc_entry: DocEntry del documento en SAP B1.

    Returns:
        dict canónico Nota de Crédito (ver contrato arriba).
    """
    raise NotImplementedError(
        "build_nota_credito_model no está implementado. "
        "Conecta con SAP B1 y retorna el dict canónico de Nota de Crédito."
    )
