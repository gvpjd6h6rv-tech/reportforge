# ReportForge API Contract

The FastAPI surface in `reportforge/server/api.py` is a facade only.

## Owners

- `api_contracts.py`: request/response contracts and FastAPI compatibility stubs.
- `api_helpers.py`: layout resolution, response formatting, and layout validation.
- `api_routes_system.py`: health and cache routes.
- `api_routes_render.py`: render, JRXML render, and preview routes.
- `api_routes_templates.py`: template CRUD and template rendering.
- `api_routes_tenants.py`: tenant theme read/write routes.
- `api_routes_designer.py`: layout validation, formula validation, and barcode preview.
- `api_routes_datasources.py`: datasource registry and query routes.

## Invariants

- `api.py` must stay thin and orchestration-only.
- Route families do not share hidden state.
- Request models remain stable and importable.
- Helpers are pure or side-effect bounded.
- Any new API responsibility must be assigned to one owner module, not added back to the facade.
