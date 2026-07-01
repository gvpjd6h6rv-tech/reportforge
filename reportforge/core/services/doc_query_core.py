from __future__ import annotations

import datetime

CONTRACT = "rf.document.dataset.v1"
SCHEMA_VERSION = "1.0.0"


class DocumentQueryError(Exception):
    """Structured error raised by fetch_document; router maps it to HTTP."""

    def __init__(self, code: str, message: str, details: str = "", http_status: int = 500) -> None:
        self.code = code
        self.message = message
        self.details = details
        self.http_status = http_status
        super().__init__(message)


def fetch_document(
    doc_type: str,
    doc_number: int,
    datasource_alias: str = "default",
    timeout: int = 10,
) -> dict:
    """
    Orchestrate: REGISTRY lookup → call mapper → validate shape → return envelope.
    Raises DocumentQueryError for every classified failure.
    doc_type is assumed valid (router validates before calling here).
    """
    from reportforge.core.render.doc_registry import REGISTRY
    from reportforge.core.services.doc_shape_validator import validate_dataset_shape
    from reportforge.core.render.datasource.db_source_errors import (
        DbConnectionError,
        DbDocNotFoundError,
        DbQueryError,
        DbTimeoutError,
    )

    doc_type_entry = REGISTRY[doc_type]

    try:
        dataset = doc_type_entry.call_builder(doc_number, datasource_alias=datasource_alias)
    except NotImplementedError as exc:
        raise DocumentQueryError(
            code="MAPPER_NOT_IMPLEMENTED",
            message=f"El mapper para '{doc_type}' no está implementado.",
            details=str(exc),
            http_status=501,
        ) from exc
    except DbDocNotFoundError as exc:
        raise DocumentQueryError(
            code="DOC_NOT_FOUND",
            message=f"Documento {doc_type} #{doc_number} no encontrado.",
            details=str(exc),
            http_status=404,
        ) from exc
    except DbConnectionError as exc:
        raise DocumentQueryError(
            code="DB_CONNECTION_FAILED",
            message="No se pudo conectar al datasource.",
            details=str(exc),
            http_status=503,
        ) from exc
    except DbTimeoutError as exc:
        raise DocumentQueryError(
            code="DB_TIMEOUT",
            message="La consulta SQL superó el timeout configurado.",
            details=str(exc),
            http_status=504,
        ) from exc
    except DbQueryError as exc:
        raise DocumentQueryError(
            code="DB_QUERY_FAILED",
            message="Error en la consulta SQL al datasource.",
            details=str(exc),
            http_status=500,
        ) from exc

    validation = validate_dataset_shape(dataset, doc_type=doc_type)
    if not validation["schemaOk"]:
        raise DocumentQueryError(
            code="SCHEMA_MISMATCH",
            message="El mapper retornó un dataset incompleto.",
            details=f"Paths faltantes: {', '.join(validation['missingPaths'])}",
            http_status=422,
        )

    return {
        "contract": CONTRACT,
        "schemaVersion": SCHEMA_VERSION,
        "docType": doc_type,
        "docNumber": doc_number,
        "retrievedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dataset": dataset,
        "validation": validation,
    }
