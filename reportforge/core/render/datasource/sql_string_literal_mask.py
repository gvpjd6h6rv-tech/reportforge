from __future__ import annotations

"""
sql_string_literal_mask — detects which character positions in a SQL
string fall inside a single-quoted string literal. Nothing else.

Responsibility: given a raw SQL string, return one boolean per character
— True if that position is inside a '...' literal (with '' as the
standard SQL escape for a literal quote inside one). Pure text scanning,
no SQL semantics beyond quote-matching.

Does NOT:
  - know about placeholders, keywords, statement kinds, or dangerous
    constructs — those are sql_parameter_parser's, sql_safety_guard's, and
    sql_procedure_allowlist's own concerns; this module is the single
    shared primitive all three call so string-literal handling isn't
    duplicated (and doesn't drift out of sync) across them.
  - execute SQL, connect to a database, or validate anything

Extracted from sql_parameter_parser.py (Fase 3), which already needed this
exact scan to correctly ignore a {?Placeholder}-looking token inside a
string literal — sql_safety_guard.py and sql_procedure_allowlist.py
(Security Patch 0) were built without it and produced false positives on
legitimate SQL containing a semicolon or the word "OPENROWSET" inside an
ordinary string value (RF-SQL-GUARD-STRING-AWARE-1).
"""


def string_literal_mask(sql: str) -> list[bool]:
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
