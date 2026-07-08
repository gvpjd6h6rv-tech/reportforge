from __future__ import annotations

import re
from dataclasses import dataclass, field

"""
sql_parameter_parser — detects Crystal-like {?ParamName} placeholders in a
SQL template. Nothing else.

Responsibility:
  - detect {?Name} placeholders (single, multiple, repeated -> one unique
    definition each, all occurrences still rewritten).
  - preserve first-occurrence order in `parameters`/`bind_order`.
  - produce prepared_sql: each {?Name} replaced with :Name — a bind-
    parameter marker BOTH existing executors already accept with a params
    dict (verified: sqlite3's own DB-API supports :name style directly;
    SQLAlchemy's text() does too) — no executor-side change needed.
  - reject a malformed placeholder ({?}, {? Fecha}, {?Fecha Desde},
    {?Fecha-Desde}) OUTSIDE a string literal, naming the offending
    snippet. A bare {FechaDesde} (no ?) is not a placeholder at all and is
    left untouched, not rejected — only a `{?` opener commits to "this is
    meant to be a placeholder."
  - ignore ANYTHING inside a single-quoted SQL string literal entirely —
    valid-shaped or not. 'Comentario = {?NoParametro}' is literal string
    content, not a placeholder to bind, so it is neither extracted nor
    validated nor rewritten. Escaped quotes ('') inside a literal are
    tracked so a string boundary isn't miscounted.

Does NOT:
  - execute SQL
  - resolve/validate parameter VALUES (report_parameter_values.py's job)
  - interpolate any value into the SQL string — this only rewrites the
    PLACEHOLDER SYNTAX; actual values are always bound separately by the
    caller through the params dict, never string-interpolated here
  - decide whether the statement itself is safe to run (sql_safety_guard's
    job, a separate module)
"""

_VALID_PLACEHOLDER = re.compile(r"\{\?([A-Za-z_][A-Za-z0-9_]*)\}")
_ANY_OPEN = re.compile(r"\{\?")


@dataclass
class ParsedSqlCommand:
    original_sql: str
    prepared_sql: str
    parameters: list[str] = field(default_factory=list)
    bind_order: list[str] = field(default_factory=list)


def _string_literal_mask(sql: str) -> list[bool]:
    """One bool per character: True if that position is inside a single-
    quoted SQL string literal ('' is the standard SQL escape for a literal
    quote inside such a string)."""
    mask = [False] * len(sql)
    in_string = False
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        if in_string:
            mask[i] = True
            if ch == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    mask[i + 1] = True
                    i += 2
                    continue
                in_string = False
            i += 1
            continue
        if ch == "'":
            in_string = True
            mask[i] = True
        i += 1
    return mask


def parse_parameters(sql: str) -> ParsedSqlCommand:
    if sql is None:
        raise ValueError("sql must not be None")

    mask = _string_literal_mask(sql)

    def _inside_string(pos: int) -> bool:
        return pos < len(mask) and mask[pos]

    valid_matches = [m for m in _VALID_PLACEHOLDER.finditer(sql) if not _inside_string(m.start())]
    valid_starts = {m.start() for m in valid_matches}

    for m in _ANY_OPEN.finditer(sql):
        if _inside_string(m.start()):
            continue
        if m.start() not in valid_starts:
            snippet = sql[m.start():m.start() + 30]
            raise ValueError(f"Invalid parameter placeholder near: {snippet!r}")

    bind_order: list[str] = []
    seen: set[str] = set()
    parts: list[str] = []
    last_end = 0
    for m in valid_matches:
        parts.append(sql[last_end:m.start()])
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            bind_order.append(name)
        parts.append(f":{name}")
        last_end = m.end()
    parts.append(sql[last_end:])
    prepared_sql = "".join(parts)

    return ParsedSqlCommand(
        original_sql=sql,
        prepared_sql=prepared_sql,
        parameters=list(bind_order),
        bind_order=list(bind_order),
    )
