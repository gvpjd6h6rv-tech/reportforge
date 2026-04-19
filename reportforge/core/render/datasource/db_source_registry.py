from __future__ import annotations

from .db_source_errors import DbSourceError
from .db_source_loader import load_spec

_REGISTRY: dict[str, dict] = {}


def register(alias: str, spec: dict) -> None:
    _REGISTRY[alias] = spec


def unregister(alias: str) -> bool:
    return bool(_REGISTRY.pop(alias, None))


def list_registered() -> list[dict]:
    return [{"alias": k, **v} for k, v in _REGISTRY.items()]


def get_registered(alias: str) -> dict | None:
    return _REGISTRY.get(alias)


def query_registered(alias: str, query: str | None = None, params: dict | None = None) -> list[dict]:
    spec = _REGISTRY.get(alias)
    if not spec:
        raise DbSourceError(f"No registered datasource: {alias!r}")
    run_spec = dict(spec)
    if query:
        run_spec["query"] = query
    if params:
        run_spec["params"] = params
    result = load_spec(run_spec)
    return result.get(run_spec.get("dataset", "items"), [])
