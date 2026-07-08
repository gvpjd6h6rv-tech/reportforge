from __future__ import annotations

import re

"""
sql_error_sanitizer — strips credentials and caps length in error messages
and log lines produced anywhere in the datasource SQL path. Nothing else.

Responsibility: take a raw string (an exception message, a log line) and
return a safe-to-display/safe-to-log version.

Does NOT:
  - execute SQL
  - decide whether a statement is allowed (sql_safety_guard's job)
  - raise or catch exceptions itself — callers pass exception text in,
    this returns a plain sanitized string

Why this exists: db_source_loader.py's own exception handler embeds the
raw connection URL directly into its DbSourceError message (`f"Query
failed [{url}]: {e}"`) — for a SQLAlchemy mssql URL that's
"mssql+pymssql://user:password@host:port/db", so a failed query today
echoes the plaintext password straight into the HTTP 500 response and any
log that captures it.
"""

_MAX_MESSAGE_LEN = 500

# scheme://user:password@host  ->  scheme://***@host
_URL_CREDENTIALS = re.compile(r"([A-Za-z0-9+.\-]+://)[^\s:@/]+:[^\s@/]+@")

# Password=xxx; / Pwd=xxx; / pwd:xxx (ODBC/connection-string style, case-insensitive)
_KV_CREDENTIALS = re.compile(r"(?i)\b(password|pwd)\s*[:=]\s*[^\s;]+")


def sanitize(message: str) -> str:
    if not message:
        return message
    text = _URL_CREDENTIALS.sub(r"\1***@", message)
    text = _KV_CREDENTIALS.sub(r"\1=***", text)
    if len(text) > _MAX_MESSAGE_LEN:
        text = text[:_MAX_MESSAGE_LEN] + "…"
    return text


def sanitize_exception(exc: BaseException) -> str:
    return sanitize(str(exc))
