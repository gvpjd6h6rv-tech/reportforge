from __future__ import annotations

from reportforge_server_http_utils import _json

"""
reportforge_server_route_sql_commands — stdlib HTTP wiring for
POST /sql-commands/parse, mirroring reportforge/server/
api_routes_sql_commands.py's FastAPI route (same dual stdlib/FastAPI
pattern already used for /validate-formula in this repo:
reportforge_server_routes_validate.py vs
reportforge/server/api_routes_designer.py).

Responsibility: ONLY adapt the stdlib request/response shape — parse the
already-decoded body dict, call sql_parameter_parser.parse_parameters()
and sql_safety_guard.check() (the SAME functions the FastAPI route calls,
not a reimplementation), write the JSON response via _json().

Does NOT:
  - execute SQL (never imports sql_executor)
  - touch datasource registry or real connections
  - infer schema (sql_schema_inspector), list procedures
    (stored_procedure_catalog), touch Field Explorer, Preview, the
    document serializer, or any exporter
  - persist anything
  - duplicate parser/guard logic — both are imported and called directly
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
