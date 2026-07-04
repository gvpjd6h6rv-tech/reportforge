from __future__ import annotations

from reportforge.core.render.datasource.db_source_pymssql import query as pymssql_query
from reportforge.core.render.datasource.db_source_errors import (
    DbConnectionError,
    DbDocNotFoundError,
    DbQueryError,
    DbSourceError,
    DbTimeoutError,
)

# ── FVE_001 detection ─────────────────────────────────────────────
# Series 97 = FVE_001 (delivery-note-sourced guide)
# FVE_002 is detected by FolioPref = "FV2"
_FVE1_SERIES: frozenset = frozenset({97})
_FVE2_FOLIO_PREF: str = "FV2"

# UDF columns that MAY or MAY NOT exist in OINV depending on SAP B1 version/setup.
# We query INFORMATION_SCHEMA first and only SELECT the ones that exist.
_OINV_OPTIONAL_UDFS = (
    "U_EXX_FE_TIPAMB",
    "U_EXX_FE_TIPEMI",
    "U_EXX_FE_ClaAcc",
    "U_EXX_FE_FECAUT",
    "U_MOT_TRASLADO",
    "U_PUNTO_PART",
    "U_PUNTO_LLEGADA",
    "U_TRANSPORTE",
    "U_TRANSPORTISTA",
    "U_GUIA_TRANSPORTISTA_NOMBRE",
    "U_GUIA_TRANSPORTISTA_RUC",
    "U_GUIA_TRANSPORTE_PLACA",
    "U_NUM_AUT_GUIA_FV2",
    "U_NUM_GUIA_REMISION_FV2",
    "U_SER_EST_FV2",
    "U_SER_PE_FV2",
    "U_FEC_INI_TRAS",
    "U_FEC_FIN_TRAS",
)

# Columns guaranteed to exist in OINV
_OINV_BASE_SQL = """
SELECT
    T0.DocEntry   AS doc_entry,
    T0.DocNum     AS doc_num,
    T0.CardCode   AS card_code,
    T0.Series     AS series,
    ISNULL(T0.FolioPref, '') AS folio_pref,
    T0.DocCur     AS currency,
    ISNULL(T0.Comments, '') AS comments
    {udf_cols}
FROM OINV T0
WHERE T0.DocNum = :doc_num
"""

_OINV_SCHEMA_SQL = """
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'OINV'
"""

_ODLN_ENTRY_FROM_INV1_SQL = """
SELECT TOP 1 T1.BaseEntry AS odln_entry
FROM INV1 T1
WHERE T1.DocEntry = :doc_entry
  AND T1.BaseType = 15
  AND T1.BaseEntry IS NOT NULL
ORDER BY T1.LineNum ASC
"""

_ODLN_ENTRY_FROM_DLN1_SQL = """
SELECT TOP 1 T1.DocEntry AS odln_entry
FROM DLN1 T1
WHERE T1.BaseType = 13
  AND T1.BaseEntry = :doc_entry
ORDER BY T1.LineNum ASC
"""

_ODLN_HEAD_SQL = """
SELECT
    T0.DocEntry                         AS odln_entry,
    T0.DocNum                           AS odln_num,
    ISNULL(T0.U_SER_EST, '')            AS ser_est,
    ISNULL(T0.U_SER_PE, '')             AS ser_pe,
    T0.FolioNum                         AS folio_num,
    ISNULL(T0.U_NUM_AUTOR, '')          AS numero_autorizacion,
    ISNULL(T0.U_SER_EST_FR, '')         AS ser_est_fr,
    ISNULL(T0.U_SER_PEFR, '')          AS ser_pe_fr,
    ISNULL(T0.U_NUM_AUT_FR, '')         AS num_aut_fr,
    ISNULL(T0.U_NUM_FAC_REL, '')        AS num_fac_rel,
    ISNULL(T0.U_PUNTO_PART, '')         AS punto_partida,
    ISNULL(T0.U_FEC_INI_TRAS, '')       AS fecha_inicio,
    ISNULL(T0.U_FEC_FIN_TRAS, '')       AS fecha_fin,
    ISNULL(T0.U_MOT_TRASLADO, '')       AS motivo,
    ISNULL(T0.U_TRANSPORTE, '')         AS transporte_code,
    ISNULL(T0.U_TRANSPORTISTA, '')      AS transportista_code,
    ISNULL(T0.U_EXX_FE_FECAUT, '')      AS fecha_autorizacion_raw
FROM ODLN T0
WHERE T0.DocEntry = :odln_entry
"""

_DLN1_LINES_SQL = """
SELECT
    ItemCode                             AS codigo,
    Dscription                           AS descripcion,
    Quantity                             AS cantidad,
    ISNULL(UomCode, '')                  AS unidad_medida,
    CAST(Text AS NVARCHAR(4000))         AS referencia
FROM DLN1
WHERE DocEntry = :odln_entry
ORDER BY LineNum
"""

_INV1_LINES_SQL = """
SELECT
    ItemCode                             AS codigo,
    Dscription                           AS descripcion,
    Quantity                             AS cantidad,
    ISNULL(UomCode, '')                  AS unidad_medida,
    CAST(Text AS NVARCHAR(4000))         AS referencia
FROM INV1
WHERE DocEntry = :doc_entry
ORDER BY LineNum
"""

_OCRD_SQL = """
SELECT
    CardName                AS razon_social,
    LicTradNum              AS identificacion,
    ISNULL(Address, '')     AS direccion,
    ISNULL(E_Mail, '')      AS email
FROM OCRD
WHERE CardCode = :card_code
"""

_CRD1_SQL = """
SELECT TOP 1
    Street, City, State
FROM CRD1
WHERE CardCode = :card_code AND AdresType = :adr_type
ORDER BY Address ASC
"""

_TRANSPORTE_SQL = """
SELECT
    ISNULL(Name, '')    AS descripcion,
    ISNULL(U_PLACA, '') AS placa
FROM [@EXXIS_TRANSPORTE]
WHERE Code = :code
"""

_TRANSPORTISTA_SQL = """
SELECT
    ISNULL(Name, '')        AS nombre,
    ISNULL(U_ID_TRANSP, '') AS ruc
FROM [@EXX_TRANSPORTISTA]
WHERE Code = :code
"""

# RF-EMPRESA-RAZON-SOCIAL-VS-COMERCIAL-1: same fix as
# invoice_queries.py::_COMPANY_SQL — OADM.AliasName holds the SRI-registered
# fiscal razón social for this installation, OADM.CompnyName holds the
# trade/commercial name. See that file's comment for the confirming evidence.
_COMPANY_SQL = """
SELECT
    AliasName   AS razon_social,
    CompnyName  AS nombre_comercial,
    TaxIdNum    AS ruc,
    CompnyAddr  AS direccion_matriz,
    Phone1      AS telefono,
    E_Mail      AS email
FROM OADM
"""


def _q(spec, sql, params):
    try:
        return pymssql_query(spec, sql, params)
    except Exception as exc:
        _reclassify(exc)


def _build_numero(ser_est, ser_pe, folio):
    est = str(ser_est or "").strip()
    pe = str(ser_pe or "").strip()
    raw = folio
    seq = str(int(raw)).zfill(9) if raw not in (None, "", 0) else ""
    if est and pe and seq:
        return f"{est}-{pe}-{seq}"
    return seq


def _punto_llegada(spec, card_code):
    for atype in ("S", "B"):
        rows = _q(spec, _CRD1_SQL, {"card_code": card_code, "adr_type": atype})
        if rows:
            r = rows[0]
            parts = [str(r.get("Street") or "").strip(),
                     str(r.get("City") or "").strip(),
                     str(r.get("State") or "").strip()]
            addr = ", ".join(p for p in parts if p)
            if addr:
                return addr
    return ""


def fetch_remision_fve1(spec, oinv_head):
    """Build remision data for FVE_001 (Series 97) — source: ODLN."""
    doc_entry = int(oinv_head["doc_entry"])
    card_code = str(oinv_head.get("card_code") or "")

    # Find linked ODLN — try INV1.BaseEntry first, then DLN1.BaseEntry fallback
    odln_entry = None
    for sql in (_ODLN_ENTRY_FROM_INV1_SQL, _ODLN_ENTRY_FROM_DLN1_SQL):
        rows = _q(spec, sql, {"doc_entry": doc_entry})
        if rows and rows[0].get("odln_entry"):
            odln_entry = int(rows[0]["odln_entry"])
            break
    if not odln_entry:
        raise DbDocNotFoundError(f"ODLN linked to OINV DocEntry={doc_entry} not found.")
    # ODLN header
    rows = _q(spec, _ODLN_HEAD_SQL, {"odln_entry": odln_entry})
    if not rows:
        raise DbDocNotFoundError(f"ODLN DocEntry={odln_entry} not found.")
    odln = rows[0]

    # Items from DLN1
    items_rows = _q(spec, _DLN1_LINES_SQL, {"odln_entry": odln_entry}) or []

    # Transporte catalog
    trans_code = str(odln.get("transporte_code") or "").strip()
    placa, trans_desc = "", ""
    if trans_code:
        tr = _q(spec, _TRANSPORTE_SQL, {"code": trans_code})
        if tr:
            placa = str(tr[0].get("placa") or "")
            trans_desc = str(tr[0].get("descripcion") or "")

    # Transportista catalog
    transp_code = str(odln.get("transportista_code") or "").strip()
    transp_nombre, transp_ruc = "", ""
    if transp_code:
        trp = _q(spec, _TRANSPORTISTA_SQL, {"code": transp_code})
        if trp:
            transp_nombre = str(trp[0].get("nombre") or "")
            transp_ruc = str(trp[0].get("ruc") or "")

    # Punto llegada
    punto_llegada = _punto_llegada(spec, card_code)

    # Destinatario from OCRD
    dest_rows = _q(spec, _OCRD_SQL, {"card_code": card_code}) or []
    dest = dest_rows[0] if dest_rows else {}

    return {
        "numero_autorizacion": str(odln.get("numero_autorizacion") or ""),
        "clave_acceso": str(odln.get("numero_autorizacion") or ""),
        "numero_documento": _build_numero(odln.get("ser_est"), odln.get("ser_pe"), odln.get("folio_num")),
        "punto_partida": str(odln.get("punto_partida") or ""),
        "punto_llegada": punto_llegada,
        "fecha_inicio": str(odln.get("fecha_inicio") or ""),
        "fecha_fin": str(odln.get("fecha_fin") or ""),
        "fecha_autorizacion": str(odln.get("fecha_autorizacion_raw") or ""),
        "motivo": str(odln.get("motivo") or ""),
        "placa": placa,
        "transportista_nombre": transp_nombre,
        "transportista_ruc": transp_ruc,
        "destinatario": {
            "razon_social": str(dest.get("razon_social") or ""),
            "identificacion": str(dest.get("identificacion") or ""),
            "tipo_identificacion": "04",
            "direccion": str(dest.get("direccion") or ""),
        },
        "items_rows": items_rows,
    }


def fetch_remision_fve2(spec, oinv_head):
    """Build remision data for FVE_002 (FolioPref=FV2) — source: OINV UDFs."""
    doc_entry = int(oinv_head["doc_entry"])
    card_code = str(oinv_head.get("card_code") or "")

    # Items from INV1
    items_rows = _q(spec, _INV1_LINES_SQL, {"doc_entry": doc_entry}) or []

    # Dynamic query stores columns as lowercase of the UDF name
    trans_code = str(oinv_head.get("u_transporte") or "").strip()
    placa = str(oinv_head.get("u_guia_transporte_placa") or "")
    if trans_code and not placa:
        tr = _q(spec, _TRANSPORTE_SQL, {"code": trans_code})
        if tr:
            placa = str(tr[0].get("placa") or "")

    transp_code = str(oinv_head.get("u_transportista") or "").strip()
    transp_nombre = str(oinv_head.get("u_guia_transportista_nombre") or "")
    transp_ruc = str(oinv_head.get("u_guia_transportista_ruc") or "")
    if transp_code and not transp_nombre:
        trp = _q(spec, _TRANSPORTISTA_SQL, {"code": transp_code})
        if trp:
            transp_nombre = str(trp[0].get("nombre") or "")
            transp_ruc = str(trp[0].get("ruc") or "")

    punto_llegada = str(oinv_head.get("u_punto_llegada") or "")
    if not punto_llegada:
        punto_llegada = _punto_llegada(spec, card_code)

    dest_rows = _q(spec, _OCRD_SQL, {"card_code": card_code}) or []
    dest = dest_rows[0] if dest_rows else {}

    return {
        "numero_autorizacion": str(oinv_head.get("u_num_aut_guia_fv2") or ""),
        "clave_acceso": str(oinv_head.get("u_num_aut_guia_fv2") or ""),
        "numero_documento": _build_numero(
            oinv_head.get("u_ser_est_fv2"),
            oinv_head.get("u_ser_pe_fv2"),
            oinv_head.get("u_num_guia_remision_fv2"),
        ),
        "punto_partida": str(oinv_head.get("u_punto_part") or ""),
        "punto_llegada": punto_llegada,
        "fecha_inicio": str(oinv_head.get("u_fec_ini_tras") or ""),
        "fecha_fin": str(oinv_head.get("u_fec_fin_tras") or ""),
        "motivo": str(oinv_head.get("u_mot_traslado") or ""),
        "placa": placa,
        "transportista_nombre": transp_nombre,
        "transportista_ruc": transp_ruc,
        "destinatario": {
            "razon_social": str(dest.get("razon_social") or ""),
            "identificacion": str(dest.get("identificacion") or ""),
            "tipo_identificacion": "04",
            "direccion": str(dest.get("direccion") or ""),
        },
        "items_rows": items_rows,
    }


def _get_oinv_head(spec: dict, doc_num: int) -> dict:
    """Query OINV header with dynamic UDF column detection."""
    try:
        schema_rows = pymssql_query(spec, _OINV_SCHEMA_SQL, {})
        existing = {r["COLUMN_NAME"] for r in schema_rows if r.get("COLUMN_NAME")}
    except Exception:
        existing = set()

    udf_parts = []
    for col in _OINV_OPTIONAL_UDFS:
        if col in existing:
            alias = col.lower().replace("u_", "", 1).replace("exx_fe_", "").replace("guia_", "")
            udf_parts.append(f",\n    ISNULL(T0.{col}, '') AS {col.lower()}")
        else:
            udf_parts.append(f",\n    '' AS {col.lower()}")

    sql = _OINV_BASE_SQL.format(udf_cols="".join(udf_parts))
    rows = _q(spec, sql, {"doc_num": doc_num})
    if not rows:
        raise DbDocNotFoundError(f"OINV DocNum={doc_num} no encontrado.")
    return rows[0]


def fetch_remision_model_data(spec: dict, doc_num: int) -> dict:
    """Fetch all data needed for the remision canonical model."""
    oinv = _get_oinv_head(spec, doc_num)

    # Company
    comp_rows = _q(spec, _COMPANY_SQL, {}) or []
    company = comp_rows[0] if comp_rows else {}

    # Detect series/folio and fetch guia data
    # FVE_001: Series=97 OR FolioPref starts with "FV" but not "FV2"
    # FVE_002: FolioPref="FV2"
    series = oinv.get("series")
    folio_pref = str(oinv.get("folio_pref") or "").strip().upper()
    is_fve1 = (series in _FVE1_SERIES) or (folio_pref not in ("FV2",) and folio_pref.startswith("FV"))
    if is_fve1:
        guia = fetch_remision_fve1(spec, oinv)
    else:
        guia = fetch_remision_fve2(spec, oinv)

    ambiente_raw = str(oinv.get("u_exx_fe_tipamb") or "")
    tipo_emision = str(oinv.get("u_exx_fe_tipemi") or "")
    fecha_inicio = guia["fecha_inicio"]
    fecha_fin = guia["fecha_fin"]

    items = [
        {
            "codigo": str(r.get("codigo") or ""),
            "descripcion": str(r.get("descripcion") or ""),
            "cantidad": float(r.get("cantidad") or 0),
            "unidad_medida": str(r.get("unidad_medida") or ""),
            "referencia": str(r.get("referencia") or "") or None,
        }
        for r in guia["items_rows"]
    ]

    return {
        "meta": {
            "doc_entry": int(oinv["doc_entry"]),
            "doc_num": int(oinv["doc_num"]),
            "obj_type": "15",
            "currency": str(oinv.get("currency") or "USD"),
        },
        "empresa": {
            "razon_social": str(company.get("razon_social") or ""),
            "ruc": str(company.get("ruc") or ""),
            "direccion_matriz": str(company.get("direccion_matriz") or ""),
            "direccion": str(company.get("direccion_matriz") or ""),
            "telefono": str(company.get("telefono") or ""),
            "email": str(company.get("email") or ""),
            "correo": str(company.get("email") or ""),
            # RF-NO-FABRICATED-FIELDS-1: no OADM/OINV column backs this
            # concept (verified: 0 matches for %CONTAB%/%AGENTE%/%RET% across
            # both tables) and SAP's own model has no source for it either —
            # left blank to match SAP's genuine absence, not fabricated.
            "obligado_contabilidad": "",
        },
        "destinatario": guia["destinatario"],
        "fiscal": {
            # RF-AMBIENTE-RAW-CODE-1: aligned to SAP's raw-code passthrough —
            # see the equivalent comment in invoice_model.py.
            "ambiente_raw": ambiente_raw,
            "ambiente": ambiente_raw,
            "tipo_emision": tipo_emision,
            "emision": tipo_emision,
            "numero_documento": guia["numero_documento"],
            "numero_autorizacion": guia["numero_autorizacion"],
            "fecha_autorizacion": guia.get("fecha_autorizacion", ""),
            "clave_acceso": guia["clave_acceso"],
        },
        "traslado": {
            "motivo": guia["motivo"],
            "ruta": None,
            "fecha_inicio_traslado": fecha_inicio,
            "fecha_fin_traslado": fecha_fin,
            "placa_vehiculo": guia["placa"],
            "placa": guia["placa"],
            "transportista_nombre": guia["transportista_nombre"],
            "transportista_ruc": guia["transportista_ruc"],
        },
        "origen": {
            "direccion": guia["punto_partida"],
        },
        "destino": {
            "direccion": guia["punto_llegada"],
        },
        "items": items,
        "observaciones": str(oinv.get("comments") or "") or None,
    }


_QUERY_ERROR_PATTERNS = (
    "Invalid column name",
    "Invalid object name",
    "Incorrect syntax near",
    "Conversion failed when converting",
)


def _reclassify(exc: Exception):
    from typing import NoReturn
    if isinstance(exc, (DbDocNotFoundError, DbConnectionError, DbTimeoutError, DbQueryError)):
        raise exc
    if isinstance(exc, DbSourceError):
        raise DbConnectionError(str(exc)) from exc
    msg = str(exc).lower()
    if "timeout" in msg or "timed out" in msg:
        raise DbTimeoutError(str(exc)) from exc
    if type(exc).__name__ == "ProgrammingError" or any(p in str(exc) for p in _QUERY_ERROR_PATTERNS):
        raise DbQueryError(str(exc)) from exc
    raise DbConnectionError(str(exc)) from exc
