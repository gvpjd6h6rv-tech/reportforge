from __future__ import annotations

import os

from reportforge.core.render.datasource.db_source_errors import DbConnectionError
from reportforge.core.render.datasource.db_source_registry import get_registered
from reportforge.core.models.invoice_queries import (
    fetch_company_info,
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


def build_invoice_model(doc_entry: int, datasource_alias: str | None = None) -> dict:
    spec = _resolve_db_spec(datasource_alias)
    header = fetch_invoice_header(spec, doc_entry)
    lines = fetch_invoice_lines(spec, doc_entry)
    company = fetch_company_info(spec)

    iva = float(header.get("iva") or 0)
    total = float(header.get("total") or 0)
    sub_sin_imp = round(total - iva, 2)
    sub_12 = sub_sin_imp if iva > 0 else 0.0
    sub_0 = 0.0 if iva > 0 else sub_sin_imp

    items = [
        {
            "codigo": str(line.get("codigo") or ""),
            "descripcion": str(line.get("descripcion") or ""),
            "cantidad": float(line.get("cantidad") or 0),
            "precio_unitario": float(line.get("precio_unitario") or 0),
            "descuento": float(line.get("descuento") or 0),
            "desc_lineal": float(line.get("desc_lineal") or 0),
            "subtotal": float(line.get("subtotal") or 0),
            "ice_porcentaje": float(line.get("ice_porcentaje") or 0),
            "ice_valor": float(line.get("ice_valor") or 0),
        }
        for line in lines
    ]

    return {
        "meta": {
            "doc_entry": int(header["doc_entry"]),
            "doc_num": int(header["doc_num"]),
            "obj_type": str(header.get("obj_type") or "13"),
            "currency": str(header.get("currency") or "USD"),
        },
        "empresa": {
            "razon_social": str(company.get("razon_social") or ""),
            "nombre_comercial": str(company.get("nombre_comercial") or company.get("razon_social") or ""),
            "ruc": str(company.get("ruc") or ""),
            "direccion_matriz": str(company.get("direccion_matriz") or ""),
            "pais": str(company.get("pais") or ""),
            "telefono": str(company.get("telefono") or ""),
            "email": str(company.get("email") or ""),
            "direccion_sucursal": None,
            "obligado_contabilidad": "SI",
            "agente_retencion": "NO",
        },
        "cliente": {
            "razon_social": str(header.get("cliente_nombre") or ""),
            "identificacion": str(header.get("cliente_ruc") or ""),
            "tipo_identificacion": str(header.get("cliente_tipo_id") or ""),
            "direccion": header.get("cliente_direccion"),
            "email": header.get("cliente_email"),
        },
        "fiscal": {
            "ambiente_raw": str(header.get("ambiente") or ""),
            "ambiente": _AMBIENTE_MAP.get(str(header.get("ambiente") or ""), str(header.get("ambiente") or "")),
            "tipo_comprobante": str(header.get("tipo_comprobante") or ""),
            "tipo_emision": str(header.get("tipo_emision") or ""),
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
            "forma_pago_fe": str(header.get("forma_pago_fe") or "01"),
            "plazo": str(header.get("plazo") or "") or None,
            "total": total,
        },
        "items": items,
        "totales": {
            "subtotal_12": sub_12,
            "subtotal_0": sub_0,
            "subtotal_sin_impuestos": sub_sin_imp,
            "iva_12": iva,
            "importe_total": total,
        },
    }
