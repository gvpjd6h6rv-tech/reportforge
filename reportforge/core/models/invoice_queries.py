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
    ISNULL(T1.Phone1, '')              AS cliente_telefono,
    ISNULL(T1.Phone2, '')              AS cliente_telefono2,
    ISNULL(T1.U_TIPO_ID, '')           AS cliente_tipo_id,
    ISNULL(T1.U_Exx_Plazo, '')         AS plazo,
    CONVERT(VARCHAR(10), T0.DocDate, 23) AS doc_date,
    T0.DocTime                         AS doc_time,
    T0.DocTotal                        AS total,
    T0.VatSum                          AS iva,
    ISNULL(T0.Comments, '')            AS comments,
    T0.U_EXX_FE_TIPAMB                 AS ambiente,
    T0.U_EXX_FE_TIPCOM                 AS tipo_comprobante,
    T0.U_EXX_FE_TIPEMI                 AS tipo_emision,
    ISNULL(T0.U_EXX_FE_Estado, '')     AS estado_fe,
    ISNULL(T0.U_EXX_FE_CODERR, '')     AS codigo_error,
    ISNULL(T0.U_EXX_FE_DESERR, '')     AS descripcion_error,
    ISNULL(T0.U_EXX_FE_PdfCreado, '')  AS pdf_generado,
    ISNULL(T0.U_EXX_FE_MailEnviado,'') AS mail_enviado,
    T0.U_SER_EST                       AS ser_est,
    T0.U_SER_PE                        AS ser_pe,
    T0.U_CORRELATIVO                   AS correlativo,
    T0.FolioNum                        AS folio_num,
    T0.U_EXX_FE_ClaAcc                 AS clave_acceso,
    T0.U_EXX_FE_ClaAcc                 AS numero_autorizacion,
    T0.U_EXX_FE_FECAUT                 AS fecha_autorizacion,
    ISNULL(FP.U_Exx_Forma_Pago, '')    AS forma_pago_fe
FROM OINV T0
INNER JOIN OCRD T1 ON T0.CardCode = T1.CardCode
LEFT JOIN [@EXX_FPAGO_VENT_DET] FP
       ON FP.Code = T0.U_EXX_FPAGO_VENTAS AND FP.LineId = 1
WHERE T0.DocNum = :doc_num
"""

# RF-NET-GROSS-PRICE-SOURCE-1: Price/LineTotal ARE the real NET (pre-VAT)
# values and PriceAfVAT/GTotal are the real GROSS values — confirmed against
# a live SSMS query on a 15%-IVA document (docnum 2021215/DocEntry 55271,
# item BCAUC.04: Price=0.434783, PriceAfVAT=0.500000 — genuinely different).
# An earlier check on an all-IVA-exempt document (docnum 1007542, VatPrcnt=0)
# showed Price≈PriceAfVAT and was wrongly read as "Price IS the gross value"
# — for a 0%-tax line NET and GROSS are numerically identical, so that
# document could never have distinguished the two. Both NET and GROSS are
# real source columns; neither needs to be derived by formula.
_LINES_SQL = """
SELECT
    LineNum                                   AS numero,
    ItemCode                                  AS codigo,
    Dscription                                AS descripcion,
    Quantity                                  AS cantidad,
    Price                                     AS precio_unitario,
    DiscPrcnt                                 AS descuento,
    ISNULL(U_DescLineal, 0)                   AS desc_lineal,
    LineTotal                                 AS subtotal,
    PriceAfVAT                                AS precio_unitario_con_iva,
    GTotal                                     AS precio_total_con_iva,
    TaxCode                                   AS tax_code,
    VatPrcnt                                   AS vat_prcnt,
    VatSum                                     AS vat_sum,
    ISNULL(U_EXX_FE_PorICEVta, 0)            AS ice_porcentaje,
    ISNULL(U_EXX_FE_ValICEVta, 0)            AS ice_valor,
    CAST(Text AS NVARCHAR(4000))              AS referencia
FROM INV1
WHERE DocEntry = :doc_entry
ORDER BY LineNum
"""

# Guías vinculadas a la factura: busca ODLNs cuyas líneas (DLN1) tengan BaseType=13
# y BaseEntry = OINV.DocEntry. Toma la clave de autorización de la guía en orden de
# prioridad: U_EXX_FE_ClaAcc → U_NUM_AUTOR. Si hay varias guías distintas, las une
# con ", " en el orden de DocEntry ascendente.
_GUIA_REF_SQL = """
SELECT DISTINCT
    T0.DocEntry AS odln_entry,
    COALESCE(
        NULLIF(ISNULL(T0.U_EXX_FE_ClaAcc, ''), ''),
        NULLIF(ISNULL(T0.U_NUM_AUTOR, ''), ''),
        ''
    ) AS guia_clave
FROM ODLN T0
INNER JOIN DLN1 T1 ON T1.DocEntry = T0.DocEntry
WHERE T1.BaseType = 13
  AND T1.BaseEntry = :doc_entry
ORDER BY T0.DocEntry ASC
"""

# RF-EMPRESA-RAZON-SOCIAL-VS-COMERCIAL-1: confirmed against the live OADM row
# for this installation — OADM.AliasName holds the SRI-registered fiscal
# razón social ("CAROLINA JULIA CHANG AJOY CHONG"), OADM.CompnyName holds the
# trade/commercial name ("SUPER MOTOS Y BICICLETAS"). Mapping CompnyName into
# razon_social (the original query) put the trade name into the layout's
# fiscal-legal-name slot.
_COMPANY_SQL = """
SELECT
    AliasName  AS razon_social,
    CompnyName AS nombre_comercial,
    TaxIdNum   AS ruc,
    CompnyAddr AS direccion_matriz,
    Country    AS pais,
    Phone1     AS telefono,
    E_Mail     AS email
FROM OADM
"""


def fetch_invoice_header(spec: dict, doc_num: int) -> dict:
    try:
        rows = pymssql_query(spec, _HEADER_SQL, {"doc_num": doc_num})
    except Exception as exc:
        _reclassify(exc)
    if not rows:
        raise DbDocNotFoundError(f"OINV DocNum={doc_num} no encontrado.")
    return rows[0]


def fetch_invoice_lines(spec: dict, doc_entry: int) -> list[dict]:
    try:
        return pymssql_query(spec, _LINES_SQL, {"doc_entry": doc_entry})
    except Exception as exc:
        _reclassify(exc)


def fetch_guia_referencias(spec: dict, doc_entry: int) -> str | None:
    """Return comma-separated guia authorization keys for ODLNs linked to this OINV DocEntry.
    Returns None if no linked guia exists or if UDF columns are missing."""
    try:
        rows = pymssql_query(spec, _GUIA_REF_SQL, {"doc_entry": doc_entry})
    except Exception:
        return None
    keys = [str(r["guia_clave"]) for r in (rows or []) if r.get("guia_clave")]
    return ", ".join(keys) if keys else None


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
