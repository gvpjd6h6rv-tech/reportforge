"""
test_r3_timeout_sqlalchemy_path_blocked_enforcement_gap.py

F19A Risk R3 (timeout) status per sub-path, after F19B-0:

  - structured-mssql path (db_source_pymssql.query, new routing added by
    this phase): TIMEOUT_ENFORCED — see
    test_sql_executor_structured_mssql_timeout_reaches_driver.py for the
    passing evidence (resolved timeout reaches pymssql.connect's
    login_timeout/timeout kwargs).

  - SQLAlchemy/url-shaped path (sa_query/get_engine, PRE-EXISTING,
    untouched by this phase): BLOCKED_TIMEOUT_ENFORCEMENT. Evidence for
    why this is not a "pequeño y seguro" fix in this phase:

    1. sqlalchemy is not an installed dependency in this environment
       (ModuleNotFoundError on `import sqlalchemy`) — any claim of
       TIMEOUT_ENFORCED for this path would be UNVERIFIABLE here, which
       this phase's own rule forbids ("no declarar timeout real si solo
       se setea un valor que nadie consume").
    2. db_source_engine.get_engine() caches one Engine per URL string in
       a module-level dict (_ENGINES), and only builds connect_args ONCE
       at first creation — a per-call resolved timeout (which varies
       call to call via sql_query_limits.resolve_timeout) cannot be
       threaded into an already-cached, reused Engine's connect_args
       without either (a) keying the engine cache by (url, timeout) —
       changing cache semantics for every existing caller of get_engine,
       not just SQL Commands, or (b) passing per-call connect options at
       .connect()/.execution_options() time — a genuinely new code path,
       not a small addition. Either is out of proportion for this phase.
    3. connect_args in get_engine() only special-cases "postgresql"/
       "mysql" substrings in the url (see assertion below) — mssql was
       never included, and this phase does not change that, to avoid
       mixing an unverifiable change into a phase whose SQL Commands
       priority is the structured-mssql path (per this phase's explicit
       scope: "SQL Commands primero", "No migrar /connect a guardar
       URL").

This file makes the GAP mechanically traceable: if a future phase adds
mssql to get_engine()'s connect_args (or removes it), it must update this
class instead of just this docstring going stale.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))


class TestR3TimeoutSqlAlchemyPathBlockedEnforcementGap(unittest.TestCase):

    def test_sqlalchemy_dependency_is_not_installed_in_this_environment(self):
        with self.assertRaises(ModuleNotFoundError):
            import sqlalchemy  # noqa: F401

    def test_get_engine_connect_args_still_exclude_mssql(self):
        source = (ROOT / "reportforge" / "core" / "render" / "datasource" / "db_source_engine.py").read_text(encoding="utf-8")
        self.assertIn('"postgresql" in url or "mysql" in url', source)
        self.assertNotIn('"mssql" in url', source)

    def test_engine_cache_is_keyed_by_url_only_not_by_timeout(self):
        source = (ROOT / "reportforge" / "core" / "render" / "datasource" / "db_source_engine.py").read_text(encoding="utf-8")
        self.assertIn("_ENGINES: dict[str, Any] = {}", source)
        self.assertIn("if url not in _ENGINES:", source)


if __name__ == "__main__":
    unittest.main()
