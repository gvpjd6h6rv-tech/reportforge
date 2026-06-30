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
        try:
            rows = query_registered(alias, query=body.get("query"), params=body.get("params", {}))
        except DbSourceError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Query error: {e}")
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
