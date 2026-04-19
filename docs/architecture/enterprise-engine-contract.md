# Enterprise Engine Contract

## Purpose

`core/render/engines/enterprise_engine.py` is a facade, not a monolith.

## Ownership Split

- `enterprise_engine.py`
  - public facade and compatibility aliases
- `enterprise_engine_shared.py`
  - pure shared helpers and formatting primitives
- `enterprise_engine_data.py`
  - data resolution and public render entrypoints
- `enterprise_engine_layout.py`
  - layout assembly, pagination, row building, section building

## Canonical Rules

- No recursive wrapper functions in the facade.
- No DOM writes in shared helpers or data resolution.
- No layout assembly in the data module.
- No data loading or file-path coercion in the layout module.
- `EnterpriseHtmlEngine` and `render_preview` remain public compatibility entrypoints.
- The facade stays thin and delegates behavior to the owner modules.

## Persistence

These boundaries are enforced by guardrail tests and must not regress silently.
