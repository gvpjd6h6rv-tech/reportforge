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
    try:
        from reportforge.server.connections_store import save as _cs_save
        _cs_save(alias, spec)
    except Exception as _exc:
        import logging as _logging
        _logging.getLogger("reportforge").warning("connections_store: failed to persist %r: %s", alias, _exc)
    reachable = pymssql_ping(spec)
    _json(handler, {"alias": alias, "registered": True, "reachable": reachable})

def _delete_ds(handler, alias: str):
    from reportforge.core.render.datasource.db_source_registry import unregister
    ok = unregister(alias)
    if not ok:
        _error(handler, 404, f"Datasource '{alias}' not found")
        return
    try:
        from reportforge.server.connections_store import remove as _cs_remove
        _cs_remove(alias)
    except Exception:
        pass
    _json(handler, {"deleted": alias})

def _post_ds_query(handler, alias: str, body: dict):
    try:
        rows = query_registered(alias, query=body.get("query"), params=body.get("params", {}))
        _json(handler, {"alias": alias, "count": len(rows), "rows": rows})
    except Exception as exc:
        _error(handler, 400, str(exc))

def _get_ds_procedures(handler, alias: str):
    from reportforge.core.render.datasource.db_source_registry import get_registered
    from reportforge.core.render.datasource.stored_procedure_catalog import list_procedures
    from reportforge.core.render.datasource.sql_error_sanitizer import sanitize_exception
    spec = get_registered(alias)
    if not spec:
        _error(handler, 404, f"Datasource '{alias}' not found")
        return
    try:
        names, warnings = list_procedures(spec)
    except Exception as e:
        _error(handler, 400, sanitize_exception(e))
        return
    _json(handler, {"alias": alias, "procedures": names, "warnings": warnings})

def _get_ds_procedure_parameters(handler, alias: str, name: str):
    from reportforge.core.render.datasource.db_source_registry import get_registered
    from reportforge.core.render.datasource.stored_procedure_catalog import read_procedure_parameters
    from reportforge.core.render.datasource.sql_error_sanitizer import sanitize_exception
    spec = get_registered(alias)
    if not spec:
        _error(handler, 404, f"Datasource '{alias}' not found")
        return
    try:
        parameters, warnings = read_procedure_parameters(spec, name)
    except ValueError as e:
        _error(handler, 400, str(e))
        return
    except Exception as e:
        _error(handler, 400, sanitize_exception(e))
        return
    _json(handler, {"alias": alias, "procedure": name, "parameters": [p.to_dict() for p in parameters], "warnings": warnings})

def _post_ds_procedure_build_command(handler, alias: str, name: str, body: dict):
    from reportforge.core.render.datasource.db_source_registry import get_registered
    from reportforge.core.render.datasource.stored_procedure_catalog import build_stored_procedure_command
    from reportforge.core.render.datasource.sql_parameter_model import SqlParameterModel
    spec = get_registered(alias)
    if not spec:
        _error(handler, 404, f"Datasource '{alias}' not found")
        return
    raw_parameters = body.get("parameters", [])
    try:
        parameters = [SqlParameterModel.from_dict(p) for p in raw_parameters]
        command = build_stored_procedure_command(name, parameters)
    except ValueError as e:
        _error(handler, 400, str(e))
        return
    _json(handler, command.to_dict())
