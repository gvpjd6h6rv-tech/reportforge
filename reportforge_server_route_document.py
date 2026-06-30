from __future__ import annotations

import json
import urllib.parse

from reportforge_server_http_utils import _respond

_CONTRACT = "rf.document.dataset.v1"
_SCHEMA_VERSION = "1.0.0"
_VALID_DOC_TYPES = frozenset(
    {"factura", "remision", "nota_credito", "retencion", "liquidacion"}
)


def _envelope_error(code: str, message: str, details: str) -> dict:
    return {
        "contract": _CONTRACT,
        "schemaVersion": _SCHEMA_VERSION,
        "error": {"code": code, "message": message, "details": details},
    }


def _respond_json(handler, status: int, data: dict) -> None:
    body = json.dumps(data, default=str, ensure_ascii=False).encode("utf-8")
    _respond(handler, status, body, "application/json; charset=utf-8")


def _get_document(handler, doc_type: str, doc_number: str) -> None:
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query)
    datasource = (qs.get("datasource") or ["default"])[0]
    try:
        timeout = max(1, min(60, int((qs.get("timeout") or ["10"])[0])))
    except (ValueError, TypeError):
        timeout = 10

    if doc_type not in _VALID_DOC_TYPES:
        _respond_json(handler, 400, _envelope_error(
            "INVALID_DOC_TYPE",
            f"Tipo de documento desconocido: '{doc_type}'.",
            f"Tipos válidos: {sorted(_VALID_DOC_TYPES)}",
        ))
        return

    try:
        doc_num_int = int(doc_number)
        if doc_num_int <= 0:
            raise ValueError
    except (ValueError, TypeError):
        _respond_json(handler, 400, _envelope_error(
            "INVALID_DOC_NUMBER",
            f"Número de documento inválido: '{doc_number}'.",
            "Debe ser un entero positivo.",
        ))
        return

    try:
        from reportforge.core.services.doc_query_core import DocumentQueryError, fetch_document
        result = fetch_document(doc_type, doc_num_int, datasource_alias=datasource, timeout=timeout)
        _respond_json(handler, 200, result)
    except DocumentQueryError as exc:
        _respond_json(handler, exc.http_status, _envelope_error(exc.code, exc.message, exc.details))
    except Exception as exc:
        _respond_json(handler, 500, _envelope_error("INTERNAL_ERROR", "Error interno inesperado.", str(exc)))
