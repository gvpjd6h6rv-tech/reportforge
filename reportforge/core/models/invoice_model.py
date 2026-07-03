from __future__ import annotations

import os

from reportforge.core.render.datasource.db_source_errors import DbConnectionError
from reportforge.core.render.datasource.db_source_registry import get_registered
from reportforge.core.models.invoice_queries import (
    fetch_company_info,
    fetch_guia_referencias,
    fetch_invoice_header,
    fetch_invoice_lines,
)

_DB_ALIAS = os.environ.get("SAP_B1_DATASOURCE", "sap_b1")

_AMBIENTE_MAP = {"1": "Pruebas", "2": "Producción"}


def _url_to_spec(url: str) -> dict:
    """Parse a mssql+pyodbc://user:pass@host:port/db URL into a pymssql spec dict."""
    from urllib.parse import urlparse, unquote
    parsed = urlparse(url)
    return {
        "type": "mssql",
        "host": parsed.hostname or "",
        "port": parsed.port or 1433,
        "database": (parsed.path or "").lstrip("/"),
        "username": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
    }


def _resolve_db_spec(alias: str | None = None) -> dict:
    """Return a pymssql connection spec from the registry or SAP_B1_DB_URL env var.

    If alias is provided and not "default": look up ONLY that alias.
    If not found, raise immediately — no fallback to sap_b1.
    Without an explicit alias: cascade through _DB_ALIAS → "default" → env var.
    """
    if alias and alias != "default":
        spec = get_registered(alias)
        if spec:
            if spec.get("host"):
                return spec
            if spec.get("url"):
                return _url_to_spec(spec["url"])
        raise DbConnectionError(
            f"No hay datasource registrado bajo '{alias}'."
        )
    for a in (_DB_ALIAS, "default"):
        spec = get_registered(a)
        if spec:
            if spec.get("host"):
                return spec
            if spec.get("url"):
                return _url_to_spec(spec["url"])
    url = os.environ.get("SAP_B1_DB_URL", "")
    if not url:
        raise DbConnectionError(
            f"No hay datasource registrado bajo '{_DB_ALIAS}' "
            "ni variable de entorno SAP_B1_DB_URL."
        )
    return _url_to_spec(url)


def _build_numero_documento(header: dict) -> str:
    """Construct SRI number: U_SER_EST-U_SER_PE-seq(9).
    seq priority: U_CORRELATIVO → FolioNum → fallback empty."""
    est = str(header.get("ser_est") or "").strip()
    pto = str(header.get("ser_pe") or "").strip()
    raw_seq = header.get("correlativo") or header.get("folio_num")
    sec = str(int(raw_seq)).zfill(9) if raw_seq not in (None, "", 0) else ""
    if est and pto and sec:
        return f"{est}-{pto}-{sec}"
    return sec or str(header.get("doc_num") or "")


_FORMA_PAGO_DESC = {
    "01": "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO",
    "15": "COMPENSACIÓN DE DEUDAS", "16": "TARJETA DE DÉBITO",
    "17": "DINERO ELECTRÓNICO",      "18": "TARJETA PREPAGO",
    "19": "TARJETA DE CRÉDITO",      "20": "OTROS CON SISTEMA FINANCIERO",
    "21": "ENDOSO DE TÍTULOS",
}


def build_invoice_model(doc_num: int, datasource_alias: str | None = None) -> dict:
    spec = _resolve_db_spec(datasource_alias)
    header = fetch_invoice_header(spec, doc_num)
    doc_entry = int(header["doc_entry"])
    lines = fetch_invoice_lines(spec, doc_entry)
    company = fetch_company_info(spec)
    guia_ref = fetch_guia_referencias(spec, doc_entry)

    iva = float(header.get("iva") or 0)
    total = float(header.get("total") or 0)
    sub_sin_imp = round(total - iva, 2)
    sub_12 = sub_sin_imp if iva > 0 else 0.0
    sub_0 = 0.0 if iva > 0 else sub_sin_imp

    items = [
        {
            "numero": int(line.get("numero") or 0),
            "codigo": str(line.get("codigo") or ""),
            "descripcion": str(line.get("descripcion") or ""),
            "cantidad": float(line.get("cantidad") or 0),
            "precio_unitario": float(line.get("precio_unitario") or 0),
            "descuento": float(line.get("descuento") or 0),
            "desc_lineal": float(line.get("desc_lineal") or 0),
            "subtotal": float(line.get("subtotal") or 0),
            "precio_total": float(line.get("subtotal") or 0),
            "ice_porcentaje": float(line.get("ice_porcentaje") or 0),
            "ice_valor": float(line.get("ice_valor") or 0),
            "referencia": str(line.get("referencia") or "") or None,
        }
        for line in lines
    ]

    forma_pago_fe = str(header.get("forma_pago_fe") or "01")
    forma_pago_desc = _FORMA_PAGO_DESC.get(forma_pago_fe, forma_pago_fe)
    plazo_val = str(header.get("plazo") or "") or None
    email_val = str(company.get("email") or "")
    tipo_emision_val = str(header.get("tipo_emision") or "")
    folio_num = header.get("folio_num")
    nota_num_val = str(int(folio_num)) if folio_num not in (None, 0, "") else str(header.get("doc_num") or "")
    raw_time = header.get("doc_time")
    hora_emision = ""
    if raw_time is not None:
        try:
            t = int(raw_time)
            hora_emision = f"{t // 100:02d}:{t % 100:02d}"
        except (ValueError, TypeError):
            pass

    return {
        "meta": {
            "doc_entry": doc_entry,
            "doc_num": int(header["doc_num"]),
            "obj_type": str(header.get("obj_type") or "13"),
            "currency": str(header.get("currency") or "USD"),
        },
        "empresa": {
            # RF-EMPRESA-RAZON-SOCIAL-VS-COMERCIAL-1: fetch_company_info's
            # razon_social/nombre_comercial now come from OADM.AliasName /
            # OADM.CompnyName respectively (swapped from the original query —
            # see _COMPANY_SQL's comment in invoice_queries.py). No fallback
            # from razon_social to nombre_comercial here: if the fiscal name
            # is genuinely blank, leaving it blank is correct — falling back
            # to the trade name would reintroduce the same collision.
            "razon_social": str(company.get("razon_social") or ""),
            "nombre_comercial": str(company.get("nombre_comercial") or ""),
            "ruc": str(company.get("ruc") or ""),
            "direccion_matriz": str(company.get("direccion_matriz") or ""),
            "pais": str(company.get("pais") or ""),
            "telefono": str(company.get("telefono") or ""),
            "email": email_val,
            "correo": email_val,
            "direccion_sucursal": None,
            "obligado_contabilidad": "SI",
            "agente_retencion": "NO",
        },
        "cliente": {
            "razon_social": str(header.get("cliente_nombre") or ""),
            "nombre": str(header.get("cliente_nombre") or ""),
            "identificacion": str(header.get("cliente_ruc") or ""),
            "tipo_identificacion": str(header.get("cliente_tipo_id") or ""),
            "direccion": header.get("cliente_direccion"),
            "email": header.get("cliente_email"),
            "telefono": str(header.get("cliente_telefono") or "") or None,
            "telefono2": str(header.get("cliente_telefono2") or "") or None,
        },
        "fiscal": {
            "ambiente_raw": str(header.get("ambiente") or ""),
            "ambiente": _AMBIENTE_MAP.get(str(header.get("ambiente") or ""), str(header.get("ambiente") or "")),
            "tipo_comprobante": str(header.get("tipo_comprobante") or ""),
            "tipo_emision": tipo_emision_val,
            "emision": tipo_emision_val,
            "estado_fe": str(header.get("estado_fe") or "") or None,
            "codigo_error": str(header.get("codigo_error") or "") or None,
            "descripcion_error": str(header.get("descripcion_error") or "") or None,
            "pdf_generado": str(header.get("pdf_generado") or "") or None,
            "mail_enviado": str(header.get("mail_enviado") or "") or None,
            "numero_documento": _build_numero_documento(header),
            "numero_autorizacion": str(header.get("numero_autorizacion") or ""),
            "fecha_autorizacion": str(header.get("fecha_autorizacion") or ""),
            "clave_acceso": str(header.get("clave_acceso") or ""),
        },
        "pago": {
            "forma_pago_fe": forma_pago_fe,
            "plazo": plazo_val,
            "total": total,
        },
        "forma_pago": {
            "descripcion": forma_pago_desc,
            "valor": total,
            "plazo": plazo_val,
            "tiempo": None,
        },
        "fecha": {
            "emision": str(header.get("doc_date") or ""),
        },
        "hora": {
            "emision": hora_emision or None,
        },
        "guia": {
            "remision": guia_ref,
        },
        "observaciones": str(header.get("comments") or "") or None,
        "nota_numero": nota_num_val,
        "subtotal": sub_sin_imp,
        "descuento": 0.0,
        "valor_total": total,
        "items": items,
        "totales": {
            "subtotal_12": sub_12,
            "subtotal_15": sub_12,
            "subtotal_0": sub_0,
            "subtotal_iva_0": sub_0,
            "subtotal_sin_impuestos": sub_sin_imp,
            "subtotal_no_objeto_iva": 0.0,
            "subtotal_exento_iva": 0.0,
            "descuento_total": 0.0,
            "valor_ice": 0.0,
            "iva_12": iva,
            "iva_15": iva,
            "propina": 0.0,
            "importe_total": total,
            "valor_total": total,
        },
    }
