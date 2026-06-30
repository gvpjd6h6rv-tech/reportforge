from __future__ import annotations

from reportforge.core.render.datasource.db_source import DbSource, query_registered, register as ds_register

from reportforge_server_http_utils import _error, _json


def _get_ds_list(handler):
    from reportforge.core.render.datasource.db_source_registry import list_registered_safe
    _json(handler, list_registered_safe())


def _post_register_ds(handler, body: dict):
    alias = body.get("alias", "")
    if not alias:
        _error(handler, 400, "alias is required")
        return
    spec = {k: v for k, v in body.items() if k != "alias"}
    ds_register(alias, spec)
    reachable = DbSource.ping(spec.get("url", "")) if spec.get("url") else None
    _json(handler, {"alias": alias, "status": "registered", "reachable": reachable})


def _post_ds_test(handler, body: dict):
    host = body.get("host", "")
    port = int(body.get("port", 1433))
    database = body.get("database", "")
    username = body.get("username", "")
    password = body.get("password", "")
    if not all([host, database, username, password]):
        _error(handler, 400, "host, database, username, password are required")
        return
    from reportforge.core.render.datasource.db_source_introspection import ping_structured
    result = ping_structured(host, port, database, username, password)
    _json(handler, result)


def _post_ds_connect(handler, alias: str, body: dict):
    host = body.get("host", "")
    port = int(body.get("port", 1433))
    database = body.get("database", "")
    username = body.get("username", "")
    password = body.get("password", "")
    if not alias:
        _error(handler, 400, "alias is required")
        return
    if not all([host, database, username, password]):
        _error(handler, 400, "host, database, username, password are required")
        return
    from reportforge.core.render.datasource.db_source_pymssql import ping as pymssql_ping
    from reportforge.core.render.datasource.db_source_registry import register
    spec = {"type": "mssql", "host": host, "port": port,
            "database": database, "username": username, "password": password}
    register(alias, spec)
    reachable = pymssql_ping(spec)
    _json(handler, {"alias": alias, "registered": True, "reachable": reachable})


def _delete_ds(handler, alias: str):
    from reportforge.core.render.datasource.db_source_registry import unregister
    ok = unregister(alias)
    if not ok:
        _error(handler, 404, f"Datasource '{alias}' not found")
        return
    _json(handler, {"deleted": alias})


def _post_ds_query(handler, alias: str, body: dict):
    try:
        rows = query_registered(alias, query=body.get("query"), params=body.get("params", {}))
        _json(handler, {"alias": alias, "count": len(rows), "rows": rows})
    except Exception as exc:
        _error(handler, 400, str(exc))
