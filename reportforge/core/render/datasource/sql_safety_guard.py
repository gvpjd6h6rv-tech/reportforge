from __future__ import annotations

import re

from .sql_procedure_allowlist import is_dangerous_construct, is_procedure_allowed
from .sql_string_literal_mask import string_literal_mask

"""
sql_safety_guard — read-only SQL admission control.

Responsibility: classify a single SQL statement and decide whether its
STATEMENT KIND is allowed to run against a registered datasource. Nothing
else.

Does NOT:
  - execute SQL
  - connect to any database
  - know about datasource aliases, credentials, or connection specs
  - decide whether a SPECIFIC EXEC target or dangerous construct is
    allowed — that decision belongs to sql_procedure_allowlist; this
    module only extracts the target/scans the text and asks it
  - sanitize error messages — that is sql_error_sanitizer's job
  - parse SQL into an AST — this is a conservative keyword/shape check,
    not a full SQL parser

Input: a raw SQL string (may include a leading comment, whitespace, one
statement or several separated by ';').

Output: check(sql) -> {"allowed": bool, "reason": str, "kind": str}
  - allowed:  True only for a single SELECT/WITH query with no dangerous
              construct, or a single EXEC/EXECUTE of an allowlisted
              procedure.
  - reason:   human-readable explanation (safe to show to a user/log — it
              never echoes back full statement text or bind values).
  - kind:     normalized classification, e.g. "SELECT", "EXEC",
              "BLOCKED:DROP", "MULTI_STATEMENT", "EMPTY".
"""

_BLOCKED_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
    "MERGE", "CREATE", "GRANT", "REVOKE",
}
_ALLOWED_LEADING_KEYWORDS = {"SELECT", "WITH"}

_COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.DOTALL)
_COMMENT_LINE = re.compile(r"--[^\n]*")
_LEADING_KEYWORD = re.compile(r"[A-Za-z_]+")
_EXEC_PROC_NAME = re.compile(r"(?:EXEC|EXECUTE)\s+(?:@\w+\s*=\s*)?([A-Za-z0-9_.\[\]]+)", re.IGNORECASE)


def _strip_comments(sql: str) -> str:
    sql = _COMMENT_BLOCK.sub(" ", sql)
    sql = _COMMENT_LINE.sub(" ", sql)
    return sql


def _split_statements(sql: str) -> list[str]:
    # RF-SQL-GUARD-STRING-AWARE-1: a bare split on ';' would misfire on a
    # perfectly legitimate single statement like SELECT 'a;b' AS x — the
    # ';' is inside a string literal, not a statement separator. Only a
    # ';' OUTSIDE any string literal counts as a real separator.
    mask = string_literal_mask(sql)
    parts: list[str] = []
    start = 0
    for i, ch in enumerate(sql):
        if ch == ";" and not mask[i]:
            parts.append(sql[start:i])
            start = i + 1
    parts.append(sql[start:])
    return [p.strip() for p in parts if p.strip()]


def _first_keyword(stmt: str) -> str:
    stripped = stmt.strip()
    while stripped.startswith("("):
        stripped = stripped[1:].strip()
    match = _LEADING_KEYWORD.match(stripped)
    return match.group(0).upper() if match else ""


def _check_exec(stmt: str) -> dict:
    match = _EXEC_PROC_NAME.search(stmt)
    proc_name = match.group(1) if match else ""
    bare_name = proc_name.strip("[]").split(".")[-1].strip("[]")
    if not is_procedure_allowed(bare_name):
        return {
            "allowed": False,
            "reason": f"Procedure is not allowlisted for execution: {bare_name}",
            "kind": "BLOCKED:UNKNOWN_EXEC",
        }
    return {"allowed": True, "reason": "", "kind": "EXEC"}


def check(sql: str) -> dict:
    if not sql or not sql.strip():
        return {"allowed": False, "reason": "Empty SQL command", "kind": "EMPTY"}

    statements = _split_statements(_strip_comments(sql))
    if not statements:
        return {"allowed": False, "reason": "Empty SQL command", "kind": "EMPTY"}
    if len(statements) > 1:
        return {
            "allowed": False,
            "reason": "Multiple SQL statements are not allowed in a single command",
            "kind": "MULTI_STATEMENT",
        }

    stmt = statements[0]

    if is_dangerous_construct(stmt):
        return {
            "allowed": False,
            "reason": "OPENROWSET/OPENDATASOURCE are not allowed",
            "kind": "BLOCKED:DANGEROUS_CONSTRUCT",
        }

    keyword = _first_keyword(stmt)

    if not keyword:
        return {"allowed": False, "reason": "Could not determine SQL statement type", "kind": "UNKNOWN"}
    if keyword in _BLOCKED_KEYWORDS:
        return {
            "allowed": False,
            "reason": f"{keyword} is not allowed — only read-only queries and stored procedure calls are permitted",
            "kind": f"BLOCKED:{keyword}",
        }
    if keyword in ("EXEC", "EXECUTE"):
        return _check_exec(stmt)
    if keyword in _ALLOWED_LEADING_KEYWORDS:
        return {"allowed": True, "reason": "", "kind": keyword}

    return {
        "allowed": False,
        "reason": f"{keyword} is not a recognized read-only statement",
        "kind": f"BLOCKED:{keyword}",
    }
