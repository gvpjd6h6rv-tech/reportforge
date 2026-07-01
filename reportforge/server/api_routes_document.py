from __future__ import annotations

from .api_contracts import JSONResponse

_CONTRACT = "rf.document.dataset.v1"
_SCHEMA_VERSION = "1.0.0"
_VALID_DOC_TYPES = frozenset(
    {"factura", "remision", "nota_credito", "retencion", "liquidacion"}
)


def _error_body(code: str, message: str, details: str) -> dict:
    return {
        "contract": _CONTRACT,
        "schemaVersion": _SCHEMA_VERSION,
        "error": {"code": code, "message": message, "details": details},
    }


def register_document_routes(app) -> None:
    @app.get("/document/{doc_type}/{doc_number}", tags=["Document"],
             summary="Fetch normalized document dataset by type and number")
    async def get_document(
        doc_type: str,
        doc_number: str,
        datasource: str = "default",
        timeout: int = 10,
    ):
        if doc_type not in _VALID_DOC_TYPES:
            return JSONResponse(
                status_code=400,
                content=_error_body(
                    "INVALID_DOC_TYPE",
                    f"Tipo de documento desconocido: '{doc_type}'.",
                    f"Tipos válidos: {sorted(_VALID_DOC_TYPES)}",
                ),
            )

        try:
            doc_num_int = int(doc_number)
            if doc_num_int <= 0:
                raise ValueError
        except (ValueError, TypeError):
            return JSONResponse(
                status_code=400,
                content=_error_body(
                    "INVALID_DOC_NUMBER",
                    f"Número de documento inválido: '{doc_number}'.",
                    "Debe ser un entero positivo.",
                ),
            )

        timeout_clamped = max(1, min(60, timeout))

        try:
            from reportforge.core.services.doc_query_core import (
                DocumentQueryError,
                fetch_document,
            )
            from reportforge.core.services.field_tree_builder import (
                build_dataset_paths,
                build_field_tree,
            )
            result = fetch_document(
                doc_type,
                doc_num_int,
                datasource_alias=datasource,
                timeout=timeout_clamped,
            )
            ds = result.get("dataset", {})
            result["fieldTree"] = build_field_tree(ds)
            result["datasetPaths"] = build_dataset_paths(ds)
            return JSONResponse(status_code=200, content=result)
        except DocumentQueryError as exc:
            return JSONResponse(
                status_code=exc.http_status,
                content=_error_body(exc.code, exc.message, exc.details),
            )
        except Exception as exc:
            return JSONResponse(
                status_code=500,
                content=_error_body(
                    "INTERNAL_ERROR",
                    "Error interno inesperado.",
                    str(exc),
                ),
            )
