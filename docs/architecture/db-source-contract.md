# Db Source Contract

`reportforge/core/render/datasource/db_source.py` is a facade only.

## Canonical Ownership

- `db_source_cache.py` owns cache state and invalidation.
- `db_source_engine.py` owns SQLAlchemy engine lifecycle and pool reuse.
- `db_source_loader.py` owns datasource loading and routing.
- `db_source_queries.py` owns SQLite and SQLAlchemy query helpers.
- `db_source_introspection.py` owns ping, list_tables, and table_schema.
- `db_source_registry.py` owns registry lifecycle and registered queries.

## Invariants

- `db_source.py` must not embed cache, engine, query, or registry logic.
- Queries do not set up engines inline.
- Introspection does not mix business execution with cache or registry setup.
- Cache code does not embed SQL logic.
- Engine/pool lifecycle has a single owner.
