from __future__ import annotations

from reportforge.core.render.datasource.db_source import DbSource, query_registered, register as ds_register

from reportforge_server_http_utils import _error, _json


def _post_register_ds(handler, body: dict):
    alias = body.get("alias", "")
    if not alias:
        _error(handler, 400, "alias is required")
        return
    spec = {k: v for k, v in body.items() if k != "alias"}
    ds_register(alias, spec)
    reachable = DbSource.ping(spec.get("url", "")) if spec.get("url") else None
    _json(handler, {"alias": alias, "status": "registered", "reachable": reachable})


def _post_ds_query(handler, alias: str, body: dict):
    try:
        rows = query_registered(alias, query=body.get("query"), params=body.get("params", {}))
        _json(handler, {"alias": alias, "count": len(rows), "rows": rows})
    except Exception as exc:
        _error(handler, 400, str(exc))
