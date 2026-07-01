from __future__ import annotations

import os

from reportforge.core.render.datasource.db_source_errors import DbConnectionError
from reportforge.core.render.datasource.db_source_registry import get_registered
from reportforge.core.models.remision_queries import fetch_remision_model_data

_DB_ALIAS = os.environ.get("SAP_B1_DATASOURCE", "sap_b1")


def _url_to_spec(url: str) -> dict:
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
    if alias and alias != "default":
        spec = get_registered(alias)
        if spec:
            if spec.get("host"):
                return spec
            if spec.get("url"):
                return _url_to_spec(spec["url"])
        raise DbConnectionError(f"No hay datasource registrado bajo '{alias}'.")
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


def build_remision_model(doc_num: int, datasource_alias: str | None = None) -> dict:
    spec = _resolve_db_spec(datasource_alias)
    return fetch_remision_model_data(spec, doc_num)
