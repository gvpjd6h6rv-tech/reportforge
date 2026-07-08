from __future__ import annotations

"""
api_routes_sql_commands — HTTP entry point for parsing/validating a raw
SQL command BEFORE it becomes a SqlCommandModel. Nothing else.

Responsibility: orchestrate ONLY — parse the request body, call
sql_parameter_parser.parse_parameters() and sql_safety_guard.check(), map
the result to a JSON response. Mirrors the existing
POST /validate-formula precedent (api_routes_designer.py): a malformed
input is reported as {"valid": false, ...} with a 200, never a 500 —
this endpoint's whole purpose is safe validation feedback, not command
execution.

Does NOT:
  - execute SQL (never imports sql_executor)
  - touch any registered datasource/connection (never imports
    db_source_registry or api_routes_datasources)
  - persist anything (no document/serializer involvement)
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
