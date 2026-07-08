from __future__ import annotations

from .api_contracts import HTTPException

"""
api_routes_sql_commands — HTTP entry point for parsing/validating a raw
SQL command BEFORE it becomes a SqlCommandModel, and (Fase 16) for
discovering a saved SqlCommandModel's inferred column schema. Nothing
else.

Responsibility: orchestrate ONLY.
  - POST /sql-commands/parse: sql_parameter_parser.parse_parameters() +
    sql_safety_guard.check(), mapped to JSON. Mirrors the existing
    POST /validate-formula precedent (api_routes_designer.py): malformed
    input is {"valid": false, ...} with 200, never 500.
  - POST /sql-commands/schema (Fase 16): resolve a registered alias,
    reconstruct+validate a SqlCommandModel, resolve fail-closed bind
    values via sql_command_schema_request.resolve_bind_values(), then
    delegate to sql_schema_inspector.inspect_schema() — controlled 404/
    400 for every failure mode, sanitized errors, never raw rows.

Does NOT:
  - execute SQL directly (never imports sql_executor)
  - persist anything (no document/serializer involvement, no schema
    caching)
  - touch Field Explorer, Preview, or any UI
"""


def register_sql_command_routes(app):
    @app.post(
        "/sql-commands/parse",
        tags=["SQL Commands"],
        summary="Parse a raw SQL command, detect {?Param} placeholders, and report safety-guard feedback — never executes",
    )
    async def _post_parse_sql_command(body: dict):
        from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters
        from reportforge.core.render.datasource.sql_safety_guard import check as guard_check

        raw_sql = body.get("sql", "")
        if not isinstance(raw_sql, str) or not raw_sql.strip():
            return {
                "valid": False,
                "error": "'sql' is required and must be a non-empty string",
                "prepared_sql": None,
                "parameters": [],
                "bind_order": [],
                "guard": None,
            }

        try:
            parsed = parse_parameters(raw_sql)
        except ValueError as e:
            return {
                "valid": False,
                "error": str(e),
                "prepared_sql": None,
                "parameters": [],
                "bind_order": [],
                "guard": None,
            }

        guard_verdict = guard_check(parsed.prepared_sql)

        return {
            "valid": True,
            "error": None,
            "prepared_sql": parsed.prepared_sql,
            "parameters": parsed.parameters,
            "bind_order": parsed.bind_order,
            "guard": guard_verdict,
        }

    @app.post(
        "/sql-commands/schema",
        tags=["SQL Commands"],
        summary="Discover inferred column schema for a saved SqlCommandModel — fail-closed parameters, never executes freely, never persists",
    )
    async def _post_sql_command_schema(body: dict):
        from reportforge.core.render.datasource.db_source import get_registered
        from reportforge.core.render.datasource.sql_command_model import SqlCommandModel
        from reportforge.core.render.datasource.sql_command_schema_request import resolve_bind_values
        from reportforge.core.render.datasource.sql_schema_inspector import inspect_schema
        from reportforge.core.render.datasource.sql_error_sanitizer import sanitize_exception

        alias = body.get("alias", "")
        spec = get_registered(alias) if alias else None
        if not spec:
            raise HTTPException(status_code=404, detail=f"Datasource '{alias}' not found")

        try:
            sql_command = SqlCommandModel.from_dict(body.get("sql_command") or {})
        except (ValueError, KeyError) as e:
            raise HTTPException(status_code=400, detail=str(e))

        try:
            bind_values = resolve_bind_values(sql_command, body.get("parameter_values"))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        try:
            result = inspect_schema(spec, sql_command.sql, parameters=bind_values)
        except Exception as e:
            raise HTTPException(status_code=400, detail=sanitize_exception(e))

        return {
            "alias": alias,
            "command_id": sql_command.id,
            "columns": [c.to_dict() for c in result.columns],
            "warnings": result.warnings,
        }
