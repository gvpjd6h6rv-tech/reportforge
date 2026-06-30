from __future__ import annotations

from typing import NoReturn

from reportforge.core.render.datasource.db_source_queries import sa_query
from reportforge.core.render.datasource.db_source_errors import (
    DbConnectionError,
    DbDocNotFoundError,
    DbSourceError,
    DbTimeoutError,
)

_HEADER_SQL = """
SELECT
    T0.DocEntry            AS doc_entry,
    T0.DocNum              AS doc_num,
    T0.ObjType             AS obj_type,
    T0.DocCurrency         AS currency,
    T1.CardName            AS cliente_nombre,
    T1.LicTradNum          AS cliente_ruc,
    T1.E_Mail              AS cliente_email,
    T1.Address             AS cliente_direccion,
    T0.DocTotal            AS total,
    T0.VatSum              AS iva,
    T0.U_Ambiente          AS ambiente,
    T0.U_TipoEmision       AS tipo_emision,
    T0.U_NumDocumento      AS numero_documento,
    T0.U_ClaveAcceso       AS clave_acceso,
    T0.U_NumAutorizacion   AS numero_autorizacion,
    T0.U_FechaAutorizacion AS fecha_autorizacion,
    T0.U_FormaPagoFE       AS forma_pago_fe
FROM OINV T0
INNER JOIN OCRD T1 ON T0.CardCode = T1.CardCode
WHERE T0.DocEntry = :doc_entry
"""

_LINES_SQL = """
SELECT
    ItemCode   AS codigo,
    Dscription AS descripcion,
    Quantity   AS cantidad,
    Price      AS precio_unitario,
    DiscPrcnt  AS descuento,
    LineTotal  AS subtotal,
    TaxCode    AS tax_code
FROM INV1
WHERE DocEntry = :doc_entry
ORDER BY LineNum
"""

_COMPANY_SQL = """
SELECT
    CompanyName AS razon_social,
    TaxOffice   AS ruc,
    Address     AS direccion_matriz
FROM OADM
"""


def fetch_invoice_header(url: str, doc_entry: int) -> dict:
    try:
        rows = sa_query(url, _HEADER_SQL, {"doc_entry": doc_entry})
    except Exception as exc:
        _reclassify(exc)
    if not rows:
        raise DbDocNotFoundError(f"OINV DocEntry={doc_entry} no encontrado.")
    return rows[0]


def fetch_invoice_lines(url: str, doc_entry: int) -> list[dict]:
    try:
        return sa_query(url, _LINES_SQL, {"doc_entry": doc_entry})
    except Exception as exc:
        _reclassify(exc)


def fetch_company_info(url: str) -> dict:
    try:
        rows = sa_query(url, _COMPANY_SQL, {})
    except Exception as exc:
        _reclassify(exc)
    return rows[0] if rows else {}


def _reclassify(exc: Exception) -> NoReturn:
    if isinstance(exc, (DbDocNotFoundError, DbConnectionError, DbTimeoutError)):
        raise exc
    if isinstance(exc, DbSourceError):
        raise DbConnectionError(str(exc)) from exc
    msg = str(exc).lower()
    if "timeout" in msg or "timed out" in msg:
        raise DbTimeoutError(str(exc)) from exc
    raise DbConnectionError(str(exc)) from exc
