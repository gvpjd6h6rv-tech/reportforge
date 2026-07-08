from __future__ import annotations

import re

"""
sql_procedure_allowlist — decides whether a specific EXEC target or SQL
construct is permitted. Nothing else.

Responsibility:
  - hold the explicit stored-procedure allowlist (deny-by-default: an EXEC
    of any procedure not added here is rejected).
  - hard-block dangerous procedure name patterns (xp_*, sp_configure)
    regardless of the allowlist — defense in depth against a proc being
    allowlisted by mistake.
  - hard-block dangerous SQL constructs (OPENROWSET, OPENDATASOURCE)
    wherever they appear in a statement, not just as an EXEC target — both
    can appear inside an otherwise-plain SELECT.

Does NOT:
  - execute SQL
  - classify statement kind or split multi-statements (sql_safety_guard's
    job — it extracts the EXEC target and passes full statement text here)
  - know about datasources, aliases, connections, or HTTP

Deny-by-default is intentional: this is an in-memory set for now (mirrors
db_source_registry._REGISTRY's own in-memory-only precedent) — the
upcoming stored-procedure-catalog phase is what will populate it from a
real, persisted catalog; this module only owns the allow/deny decision.
"""

_ALLOWLIST: set[str] = set()

_HARD_BLOCKED_PREFIXES = ("XP_", "SP_")
_DANGEROUS_CONSTRUCTS = re.compile(r"\b(OPENROWSET|OPENDATASOURCE)\b", re.IGNORECASE)


def _normalize(name: str) -> str:
    return name.strip().strip("[]").split(".")[-1].strip("[]").upper()


def add_to_allowlist(name: str) -> None:
    if name:
        _ALLOWLIST.add(_normalize(name))


def remove_from_allowlist(name: str) -> None:
    _ALLOWLIST.discard(_normalize(name))


def is_procedure_allowed(name: str) -> bool:
    if not name:
        return False
    normalized = _normalize(name)
    if normalized.startswith(_HARD_BLOCKED_PREFIXES):
        return False
    return normalized in _ALLOWLIST


def is_dangerous_construct(sql_text: str) -> bool:
    """True if OPENROWSET/OPENDATASOURCE appear anywhere in the given SQL
    text — these are ordinary functions usable inside a plain SELECT, not
    just an EXEC target, so this is checked against the whole statement."""
    if not sql_text:
        return False
    return bool(_DANGEROUS_CONSTRUCTS.search(sql_text))


def get_allowlist() -> list[str]:
    return sorted(_ALLOWLIST)


def clear_allowlist() -> None:
    """Test-only reset — mirrors the pattern other registry-style modules
    in this package expose for test isolation (e.g. db_source_registry's
    _REGISTRY.clear())."""
    _ALLOWLIST.clear()
