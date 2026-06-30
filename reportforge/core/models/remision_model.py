# core/models/remision_model.py
# ─────────────────────────────────────────────────────────────────
# Minimal functional builder for local operational use.
# Implement SAP B1 integration later without changing the contract.
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

from copy import deepcopy

from reportforge.core.render.doc_registry_remision import REMISION_SAMPLE


def build_remision_model(doc_entry: int, datasource_alias=None) -> dict:
    """
    Construye un dict canónico de Guía de Remisión listo para render local.

    This is a minimal working implementation. It keeps the canonical shape
    expected by the renderer and uses the bundled sample payload as baseline.
    """
    data = deepcopy(REMISION_SAMPLE)
    data["meta"]["doc_entry"] = doc_entry
    data["meta"]["doc_num"] = doc_entry
    data["fiscal"]["numero_documento"] = f"006-001-{doc_entry:09d}"
    return data
