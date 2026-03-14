# core/models/retencion_model.py
# ─────────────────────────────────────────────────────────────────
# Stub para build_retencion_model.
#
# Contrato de salida (dict canónico Comprobante de Retención):
# {
#   "meta": {
#     "doc_entry": int,
#     "doc_num":   int,
#     "obj_type":  "46",     # SAP ObjType para A/P Invoice retención
#     "currency":  "USD",
#   },
#   "empresa": {             # Agente de retención (empresa compradora)
#     "razon_social":          str,
#     "ruc":                   str,
#     "direccion_matriz":      str,
#     "obligado_contabilidad": str,
#     "agente_retencion":      str,  # Número resolución agente retención SRI
#   },
#   "proveedor": {           # Sujeto de retención (vendedor)
#     "razon_social":          str,
#     "identificacion":        str,
#     "tipo_identificacion":   str,  # "04"=RUC, "05"=cédula
#     "direccion":             str,
#     "email":                 str,
#   },
#   "fiscal": {
#     "ambiente":              str,
#     "tipo_emision":          str,
#     "numero_documento":      str,  # "007-001-000000089"
#     "numero_autorizacion":   str,
#     "fecha_autorizacion":    str,
#     "clave_acceso":          str,
#   },
#   "doc_sustento": {        # Factura del proveedor que origina la retención
#     "numero_documento":      str,  # "001-001-000005678"
#     "fecha_emision":         str,
#     "tipo_documento":        str,  # "01"=Factura, "03"=Liq. Compras
#     "serie_doc_sustento":    str,  # "001-001"
#     "numero_doc_sustento":   str,  # "000005678"
#   },
#   "impuestos": [           # Lista de retenciones aplicadas
#     {
#       "tipo":              str,    # "RENTA" / "IVA"
#       "codigo_retencion":  str,    # Código tabla SRI (ej: "303", "721", "725")
#       "descripcion":       str,    # "Honorarios y demás pagos..." etc.
#       "base_imponible":    float,
#       "porcentaje":        float,  # ej: 10.0 (%)
#       "valor_retenido":    float,
#     },
#     ...
#   ],
#   "totales": {
#     "total_base_imponible":  float,
#     "total_retenido":        float,
#     "total_retenido_renta":  float,
#     "total_retenido_iva":    float,
#   },
# }
# ─────────────────────────────────────────────────────────────────


def build_retencion_model(doc_entry: int) -> dict:
    """
    Construye el dict canónico de Comprobante de Retención desde SAP B1.

    TODO: implementar conexión SAP B1.
          Consultar: OVPM (outgoing payments),
          tablas personalizadas de retención (UDO),
          JDT1 para asientos de retención.
          Códigos retención en tabla @RET_CODES o similar.

    Args:
        doc_entry: DocEntry del documento en SAP B1.

    Returns:
        dict canónico Comprobante de Retención (ver contrato arriba).
    """
    raise NotImplementedError(
        "build_retencion_model no está implementado. "
        "Conecta con SAP B1 y retorna el dict canónico de Retención."
    )
