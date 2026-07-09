from __future__ import annotations

from pathlib import Path

from .db_source_cache import cache_get, cache_key, cache_set, _DEFAULT_TTL
from .db_source_errors import DbSourceError
from .db_source_pymssql import query as pymssql_query
from .db_source_queries import sa_query, sqlite_query
from .db_source_spec_adapter import is_structured_mssql_spec, safe_display_target, to_executable_spec
from .sql_error_sanitizer import sanitize


def load_spec(spec: dict, base_path: Path | None = None) -> dict:
    kind = spec.get("type", "db")
    query = spec.get("query", "").strip()
    params = spec.get("params") or {}
    ttl = int(spec.get("ttl", _DEFAULT_TTL))
    dataset = spec.get("dataset", "items")

    if not query:
        return {dataset: []}

    # F19B-0 (resolves F19A Claim C7): a structured mssql spec — the shape
    # persisted by connections_store.py / produced by POST
    # /datasources/{alias}/connect — has no 'url' at all. Route it through
    # db_source_pymssql.query() (the existing, already-used driver for
    # this exact shape elsewhere, e.g. invoice_queries.py) instead of the
    # SQLAlchemy 'url' branch below, which always raised here before this
    # phase. The display/cache-key label is credential-free by
    # construction (never a concatenated connection string), so no
    # password ever reaches the cache key, a log line, or an error
    # message via this branch.
    structured_mssql = is_structured_mssql_spec(spec)
    if structured_mssql:
        try:
            normalized_spec = to_executable_spec(spec)
        except ValueError as e:
            # to_executable_spec() only raises for a spec this branch
            # already classified as "structured mssql" (type == 'mssql',
            # no 'url') that is missing a required field — re-raised as
            # DbSourceError so callers that specifically catch
            # DbSourceError (every HTTP route in api_routes_datasources.py
            # and api_routes_sql_commands.py) keep working unchanged; a
            # bare ValueError would otherwise escape uncaught as a 500.
            raise DbSourceError(str(e)) from e
        url = safe_display_target(normalized_spec)
    elif kind == "sqlite":
        db_path = spec.get("path", ":memory:")
        if base_path and not Path(db_path).is_absolute():
            db_path = str(base_path / db_path)
        url = db_path
    else:
        url = spec.get("url", "")
        if not url:
            raise DbSourceError("db datasource requires 'url'")

    ckey = cache_key(url, query, params)
    if ttl > 0:
        cached = cache_get(ckey)
        if cached is not None:
            return {dataset: cached}

    try:
        if structured_mssql:
            rows = pymssql_query(normalized_spec, query, params)
        elif kind == "sqlite" or url.startswith("sqlite"):
            db_path = url
            if url.startswith("sqlite:///"):
                db_path = url[10:]
            elif url.startswith("sqlite:///:memory:"):
                db_path = ":memory:"
            rows = sqlite_query(db_path, query, params)
        else:
            rows = sa_query(url, query, params)
    except Exception as e:
        # sanitize() runs on the WHOLE composed message, not just str(e) —
        # url may itself carry embedded credentials (e.g. mssql+pymssql://
        # user:password@host), and the sanitizer's regex redacts that too.
        # For the structured_mssql branch, url is already credential-free
        # (safe_display_target never embeds username/password), so this
        # is defense-in-depth, not the only safety net, for that branch.
        raise DbSourceError(sanitize(f"Query failed [{url}]: {e}")) from e

    if ttl > 0:
        cache_set(ckey, rows, ttl)

    return {dataset: rows}
