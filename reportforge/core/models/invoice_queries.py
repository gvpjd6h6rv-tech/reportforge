from __future__ import annotations

from typing import NoReturn

from reportforge.core.render.datasource.db_source_pymssql import query as pymssql_query
from reportforge.core.render.datasource.db_source_errors import (
    DbConnectionError,
    DbDocNotFoundError,
    DbQueryError,
    DbSourceError,
    DbTimeoutError,
)

_HEADER_SQL = """
SELECT
    T0.DocEntry                        AS doc_entry,
    T0.DocNum                          AS doc_num,
    T0.ObjType                         AS obj_type,
    T0.DocCur                          AS currency,
    T1.CardName                        AS cliente_nombre,
    T1.LicTradNum                      AS cliente_ruc,
    T1.E_Mail                          AS cliente_email,
    T1.Address                         AS cliente_direccion,
    ISNULL(T1.U_TIPO_ID, '')           AS cliente_tipo_id,
    T0.DocTotal                        AS total,
    T0.VatSum                          AS iva,
    T0.U_EXX_FE_TIPAMB                 AS ambiente,
    T0.U_EXX_FE_TIPCOM                 AS tipo_comprobante,
    T0.U_EXX_FE_TIPEMI                 AS tipo_emision,
    ISNULL(T0.U_EXX_FE_Estado, '')     AS estado_fe,
    T0.U_SER_EST                       AS ser_est,
    T0.U_SER_PE                        AS ser_pe,
    T0.FolioNum                        AS folio_num,
    T0.U_NUM_AUTOR                     AS clave_acceso,
    T0.U_NUM_AUTOR                     AS numero_autorizacion,
    T0.U_EXX_FE_FECAUT                 AS fecha_autorizacion,
    ISNULL(FP.U_Exx_Forma_Pago, '')    AS forma_pago_fe
FROM OINV T0
INNER JOIN OCRD T1 ON T0.CardCode = T1.CardCode
LEFT JOIN [@EXX_FPAGO_VENT_DET] FP
       ON FP.Code = T0.U_EXX_FPAGO_VENTAS AND FP.LineId = 1
WHERE T0.DocEntry = :doc_entry
"""

_LINES_SQL = """
SELECT
    ItemCode                                  AS codigo,
    Dscription                                AS descripcion,
    Quantity                                  AS cantidad,
    Price                                     AS precio_unitario,
    DiscPrcnt                                 AS descuento,
    ISNULL(U_DescLineal, 0)                   AS desc_lineal,
    LineTotal                                 AS subtotal,
    TaxCode                                   AS tax_code,
    ISNULL(U_EXX_FE_PorICEVta, 0)            AS ice_porcentaje,
    ISNULL(U_EXX_FE_ValICEVta, 0)            AS ice_valor
FROM INV1
WHERE DocEntry = :doc_entry
ORDER BY LineNum
"""

_COMPANY_SQL = """
SELECT
    CompanyName AS razon_social,
    Address     AS direccion_matriz
FROM OADM
"""


def fetch_invoice_header(spec: dict, doc_entry: int) -> dict:
    try:
        rows = pymssql_query(spec, _HEADER_SQL, {"doc_entry": doc_entry})
    except Exception as exc:
        _reclassify(exc)
    if not rows:
        raise DbDocNotFoundError(f"OINV DocEntry={doc_entry} no encontrado.")
    return rows[0]


def fetch_invoice_lines(spec: dict, doc_entry: int) -> list[dict]:
    try:
        return pymssql_query(spec, _LINES_SQL, {"doc_entry": doc_entry})
    except Exception as exc:
        _reclassify(exc)


def fetch_company_info(spec: dict) -> dict:
    try:
        rows = pymssql_query(spec, _COMPANY_SQL, {})
    except Exception as exc:
        _reclassify(exc)
    return rows[0] if rows else {}


_QUERY_ERROR_PATTERNS = (
    "Invalid column name",
    "Invalid object name",
    "Incorrect syntax near",
    "Conversion failed when converting",
    "Column name or number of supplied values",
)


def _reclassify(exc: Exception) -> NoReturn:
    if isinstance(exc, (DbDocNotFoundError, DbConnectionError, DbTimeoutError, DbQueryError)):
        raise exc
    if isinstance(exc, DbSourceError):
        raise DbConnectionError(str(exc)) from exc
    msg = str(exc).lower()
    if "timeout" in msg or "timed out" in msg:
        raise DbTimeoutError(str(exc)) from exc
    # pymssql raises ProgrammingError for SQL schema/syntax errors
    if type(exc).__name__ == "ProgrammingError" or any(p in str(exc) for p in _QUERY_ERROR_PATTERNS):
        raise DbQueryError(str(exc)) from exc
    raise DbConnectionError(str(exc)) from exc
