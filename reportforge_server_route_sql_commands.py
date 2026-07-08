from __future__ import annotations

from reportforge_server_http_utils import _error, _json

"""
reportforge_server_route_sql_commands — stdlib HTTP wiring for
POST /sql-commands/parse and (Fase 16) POST /sql-commands/schema,
mirroring reportforge/server/api_routes_sql_commands.py's FastAPI routes
(same dual stdlib/FastAPI pattern already used for /validate-formula in
this repo: reportforge_server_routes_validate.py vs
reportforge/server/api_routes_designer.py).

Responsibility: ONLY adapt the stdlib request/response shape.
  - /sql-commands/parse: parse_parameters() + guard_check(), same
    functions the FastAPI route calls, not a reimplementation.
  - /sql-commands/schema: resolve alias -> SqlCommandModel.from_dict() ->
    resolve_bind_values() (same shared helper the FastAPI route uses) ->
    inspect_schema() -> sanitized JSON, same failure-mode mapping as the
    FastAPI route (404/400/200).

Does NOT:
  - execute SQL (never imports sql_executor)
  - touch datasource registry writes or real connections beyond
    get_registered() (read-only alias lookup)
  - touch Field Explorer, Preview, the document serializer, or any
    exporter
  - persist anything
  - duplicate parser/guard/schema-request logic — all imported and
    called directly
"""


def _post_sql_command_parse(handler, body: dict):
    from reportforge.core.render.datasource.sql_parameter_parser import parse_parameters
    from reportforge.core.render.datasource.sql_safety_guard import check as guard_check

    raw_sql = body.get("sql", "")
    if not isinstance(raw_sql, str) or not raw_sql.strip():
        _json(handler, {
            "valid": False,
            "error": "'sql' is required and must be a non-empty string",
            "prepared_sql": None,
            "parameters": [],
            "bind_order": [],
            "guard": None,
        })
        return

    try:
        parsed = parse_parameters(raw_sql)
    except ValueError as e:
        _json(handler, {
            "valid": False,
            "error": str(e),
            "prepared_sql": None,
            "parameters": [],
            "bind_order": [],
            "guard": None,
        })
        return

    guard_verdict = guard_check(parsed.prepared_sql)

    _json(handler, {
        "valid": True,
        "error": None,
        "prepared_sql": parsed.prepared_sql,
        "parameters": parsed.parameters,
        "bind_order": parsed.bind_order,
        "guard": guard_verdict,
    })


def _post_sql_command_schema(handler, body: dict):
    from reportforge.core.render.datasource.db_source import get_registered
    from reportforge.core.render.datasource.sql_command_model import SqlCommandModel
    from reportforge.core.render.datasource.sql_command_schema_request import resolve_bind_values
    from reportforge.core.render.datasource.sql_schema_inspector import inspect_schema
    from reportforge.core.render.datasource.sql_error_sanitizer import sanitize_exception

    alias = body.get("alias", "")
    spec = get_registered(alias) if alias else None
    if not spec:
        _error(handler, 404, f"Datasource '{alias}' not found")
        return

    try:
        sql_command = SqlCommandModel.from_dict(body.get("sql_command") or {})
    except (ValueError, KeyError) as e:
        _error(handler, 400, str(e))
        return

    try:
        bind_values = resolve_bind_values(sql_command, body.get("parameter_values"))
    except ValueError as e:
        _error(handler, 400, str(e))
        return

    try:
        result = inspect_schema(spec, sql_command.sql, parameters=bind_values)
    except Exception as e:
        _error(handler, 400, sanitize_exception(e))
        return

    _json(handler, {
        "alias": alias,
        "command_id": sql_command.id,
        "columns": [c.to_dict() for c in result.columns],
        "warnings": result.warnings,
    })
