from __future__ import annotations

from .api_contracts import DatasourceRegisterRequest, SQLConnTestRequest, SQLConnRegisterRequest, HTTPException


def register_datasource_routes(app):
    @app.get("/datasources", tags=["Datasources"], summary="List registered datasources (no credentials)")
    async def _get_datasources():
        from reportforge.core.render.datasource.db_source_registry import list_registered_safe
        return list_registered_safe()

    @app.post("/datasources/_test", tags=["Datasources"], summary="Test a SQL connection without registering")
    async def _post_ds_test(req: SQLConnTestRequest):
        from reportforge.core.render.datasource.db_source_introspection import ping_structured
        return ping_structured(req.host, req.port, req.database, req.username, req.password)

    @app.post("/datasources/{alias}/connect", tags=["Datasources"], summary="Register a SQL connection from structured params")
    async def _post_ds_connect(alias: str, req: SQLConnRegisterRequest):
        from reportforge.core.render.datasource.db_source_pymssql import ping as pymssql_ping
        from reportforge.core.render.datasource.db_source_registry import register
        import logging as _logging
        spec = {"type": "mssql", "host": req.host, "port": req.port,
                "database": req.database, "username": req.username, "password": req.password}
        register(alias, spec)
        try:
            from reportforge.server.connections_store import save as _cs_save
            _cs_save(alias, spec)
        except Exception as _exc:
            _logging.getLogger("reportforge").warning("connections_store: failed to persist %r: %s", alias, _exc)
        reachable = pymssql_ping(spec)
        return {"alias": alias, "registered": True, "reachable": reachable}

    @app.post("/datasources", tags=["Datasources"], status_code=201, summary="Register a named datasource connection")
    async def _post_register_ds(req: DatasourceRegisterRequest):
        from reportforge.core.render.datasource.db_source import register, DbSource
        spec = {"type": req.type, "url": req.url, "query": req.query, "params": req.params, "ttl": req.ttl}
        register(req.alias, spec)
        reachable = DbSource.ping(req.url) if req.url else None
        return {"alias": req.alias, "status": "registered", "reachable": reachable}

    @app.delete("/datasources/{alias}", tags=["Datasources"])
    async def _delete_datasource(alias: str):
        from reportforge.core.render.datasource.db_source import unregister
        if not unregister(alias):
            raise HTTPException(status_code=404, detail=f"Datasource '{alias}' not found")
        try:
            from reportforge.server.connections_store import remove as _cs_remove
            _cs_remove(alias)
        except Exception:
            pass
        return {"deleted": alias}

    @app.post("/datasources/{alias}/query", tags=["Datasources"], summary="Execute a query against a registered datasource")
    async def _post_ds_query(alias: str, body: dict):
        from reportforge.core.render.datasource.db_source import query_registered, DbSourceError
        from reportforge.core.render.datasource.sql_error_sanitizer import sanitize_exception
        try:
            rows = query_registered(
                alias,
                query=body.get("query"),
                params=body.get("params", {}),
                max_rows=body.get("max_rows"),
            )
        except DbSourceError as e:
            # DbSourceError messages are already sanitized at their source
            # (sql_safety_guard's own reasons never echo raw SQL/values;
            # db_source_loader.py runs sanitize() before raising) — no
            # further processing needed here, just the HTTP mapping.
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            # Defense in depth: an unexpected, not-yet-wrapped exception
            # must still never surface a raw connection URL or password.
            raise HTTPException(status_code=500, detail=f"Query error: {sanitize_exception(e)}")
        return {"alias": alias, "count": len(rows), "rows": rows}

    @app.get("/datasources/{alias}/tables", tags=["Datasources"], summary="List tables in a registered datasource")
    async def _get_ds_tables(alias: str):
        from reportforge.core.render.datasource.db_source import get_registered, DbSource
        spec = get_registered(alias)
        if not spec:
            raise HTTPException(status_code=404, detail=f"Datasource '{alias}' not found")
        try:
            tables = DbSource.list_tables(spec.get("url", ""))
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"alias": alias, "tables": tables}

    @app.get("/datasources/{alias}/tables/{table}/schema", tags=["Datasources"], summary="Get column schema for a table")
    async def _get_ds_schema(alias: str, table: str):
        from reportforge.core.render.datasource.db_source import get_registered, DbSource
        spec = get_registered(alias)
        if not spec:
            raise HTTPException(status_code=404, detail=f"Datasource '{alias}' not found")
        try:
            schema = DbSource.table_schema(spec.get("url", ""), table)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"alias": alias, "table": table, "columns": schema}

    @app.get("/datasources/{alias}/procedures", tags=["Datasources"], summary="List stored procedures in a registered datasource — never executes")
    async def _get_ds_procedures(alias: str):
        from reportforge.core.render.datasource.db_source import get_registered
        from reportforge.core.render.datasource.stored_procedure_catalog import list_procedures
        from reportforge.core.render.datasource.sql_error_sanitizer import sanitize_exception
        spec = get_registered(alias)
        if not spec:
            raise HTTPException(status_code=404, detail=f"Datasource '{alias}' not found")
        try:
            names, warnings = list_procedures(spec)
        except Exception as e:
            raise HTTPException(status_code=400, detail=sanitize_exception(e))
        return {"alias": alias, "procedures": names, "warnings": warnings}

    @app.get("/datasources/{alias}/procedures/{name}/parameters", tags=["Datasources"], summary="Read a stored procedure's parameters — never executes")
    async def _get_ds_procedure_parameters(alias: str, name: str):
        from reportforge.core.render.datasource.db_source import get_registered
        from reportforge.core.render.datasource.stored_procedure_catalog import read_procedure_parameters
        from reportforge.core.render.datasource.sql_error_sanitizer import sanitize_exception
        spec = get_registered(alias)
        if not spec:
            raise HTTPException(status_code=404, detail=f"Datasource '{alias}' not found")
        try:
            parameters, warnings = read_procedure_parameters(spec, name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=400, detail=sanitize_exception(e))
        return {"alias": alias, "procedure": name, "parameters": [p.to_dict() for p in parameters], "warnings": warnings}

    @app.post("/datasources/{alias}/procedures/{name}/build-command", tags=["Datasources"], summary="Build a prepared SqlCommandModel for a stored procedure call — never executes")
    async def _post_ds_procedure_build_command(alias: str, name: str, body: dict):
        from reportforge.core.render.datasource.db_source import get_registered
        from reportforge.core.render.datasource.stored_procedure_catalog import build_stored_procedure_command
        from reportforge.core.render.datasource.sql_parameter_model import SqlParameterModel
        spec = get_registered(alias)
        if not spec:
            raise HTTPException(status_code=404, detail=f"Datasource '{alias}' not found")
        raw_parameters = body.get("parameters", [])
        try:
            parameters = [SqlParameterModel.from_dict(p) for p in raw_parameters]
            command = build_stored_procedure_command(name, parameters)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return command.to_dict()
