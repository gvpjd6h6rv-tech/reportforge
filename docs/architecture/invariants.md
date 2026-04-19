# Runtime Invariants

These invariants are canonical for the RF runtime.

## Ownership

- One owner per subsystem.
- One source of truth per runtime state.
- No duplicate writers for the same DOM or model path.

## Architecture

- No inline runtime scripts or styles.
- No legacy bridge unless it is a short-lived shim with an explicit removal plan.
- No monster files.
- No mixed responsibilities in a single module.
- Facades stay thin. Logic lives below them.
- Render engines are split by concern: facade, shared helpers, element renderers, and codecs each have one owner.
- Element rendering is split by concern: `element_renderers.py` owns common dispatch and pure shape helpers, while `element_embed_renderers.py` owns heavy chart/table/subreport rendering.
- Enterprise rendering is split by concern: `enterprise_engine.py` is only a facade; `enterprise_engine_shared.py` owns pure helpers, `enterprise_engine_data.py` owns data resolution and public entrypoints, and `enterprise_engine_layout.py` owns layout assembly and pagination.
- Formula parsing is split by concern: `formula_parser.py` is only a facade; `formula_parser_core.py` owns parsing and AST construction; `formula_ast.py` owns node definitions; `formula_tokenizer.py` owns tokens; `formula_functions.py` owns the function catalog; `formula_evaluator.py` is the evaluation entrypoint; `formula_eval_dispatch.py` dispatches evaluation by node; `formula_eval_functions.py` owns function dispatch; `formula_eval_resolution.py` owns field resolution and special fields; `formula_eval_aggregates.py` owns aggregates; `type_coercion.py` owns coercions; `formula_eval_nodes.py` is a reexport facade; and `eval_context.py` is the compatibility wrapper for existing callers.
- Crystal Reports function catalog is split by concern: `cr_functions.py` is facade-only; `cr_functions_shared.py` owns shared coercion helpers; `cr_functions_datetime.py`, `cr_functions_string.py`, `cr_functions_conversion.py`, `cr_functions_math.py`, `cr_functions_formatting.py`, `cr_functions_predicates.py`, and `cr_functions_conditionals.py` each own one family; `cr_functions_registry.py` owns the registry and dispatch.
- Db datasource access is split by concern: `db_source.py` is facade-only; `db_source_cache.py` owns cache state; `db_source_engine.py` owns engine/pool lifecycle; `db_source_loader.py` owns load routing; `db_source_queries.py` owns SQLite/SQLAlchemy query helpers; `db_source_introspection.py` owns ping and schema inspection; and `db_source_registry.py` owns registry lifecycle.
- `reportforge_server.py` is only the HTTP facade and entrypoint; route logic lives in service modules.
- Each server route has a single owner module: health, favicon, designer shell, static assets, barcode, preview, render, validate, and datasources are all separate files.

## Runtime

- Selection, canvas, preview, zoom, and history each have a single canonical owner.
- Geometry is split by concern: `GeometryCore.js` owns pure primitives; `CanvasGeometry.js` owns canvas/page transforms; `SelectionGeometry.js` owns selection bounds, handles, and rubber-band math; `HitTestGeometry.js` owns pure hit-testing predicates.
- Geometry modules do not write DOM, mutate DS, or depend on scheduler state.
- Scheduler-driven DOM writes only.
- Geometry contracts are shape-stable.
- Model persistence uses fine-grained geometry: `MODEL_GRID` is the canonical persistence grid for fine editing and is anchored to 0.01 mm at 96dpi; legacy `GRID` remains only as a fallback/compatibility grid.
- Safe mode and recovery must remain explicit and observable.
- The designer shell must carry `data-dom-owner` tags on `#app`, `#main-area`, `#panel-left`, `#canvas-area`, `#workspace`, and `#panel-right`.
- CSS ownership is split between host and panels: host width, panel widths, and canvas width contracts are separately owned and must not bleed across boundaries.
- Layout drift is a failing condition: shell DOM order and width contracts are asserted in tests, not inferred from visual inspection.
- Writer conflicts are recorded in `docs/architecture/writer-conflict-log.md` and treated as durable architectural debt until explicitly retired.

## Designer Shell Canon

- CSS bleed guard is canonical and must stay asserted by tests.
- Host vs panel width contract is canonical and must stay asserted by tests.
- DOM ownership tags are canonical and must stay present on shell owner nodes.
- Layout drift assertion is canonical and must fail on structural regressions.
- Writer conflict log is canonical and must remain the durable record of mixed-ownership debt.
- `CommandRuntime.js` is only a facade; the command, view, file, doc-type, handler, and init responsibilities live in dedicated `CommandRuntime*.js` owners.
- `UIAdapters` and `MenuAdapters` remain the only DOM wiring owners for command dispatch, while `CommandRuntime` stays free of direct event listener registration.
- `RenderScheduler.js` is only a facade; state, frame flush, queueing, and DOM write scope guards live in dedicated `RenderScheduler*.js` owners.
- The scheduler is the sole canonical writer gate: no engine may bypass `RenderScheduler` for DOM scheduling or write-scope checks.
- `CanvasLayoutEngine.js` is only a facade; contract helpers, size updates, and element DOM writing live in dedicated `CanvasLayout*.js` owners.
- Canvas element DOM and canvas layer sizing are separate writer responsibilities with separate contracts and tests.
- `PreviewEngineV19` is only a facade; preview DOM contracts, data resolution, mode toggling, and renderer logic live in dedicated `PreviewEngine*.js` owners.
- Preview DOM is explicit: `#preview-layer` and `#preview-content` are required contracts and must be asserted in tests.
- Formula and debug are split by concern: `FormulaEngine.js` owns formula parsing/evaluation; `FormulaEditorDialog.js` owns formula editing UI; `DesignerUI.js` owns mode toggling; `DebugTrace.js` owns debug state; `DebugPanelUtils.js` owns shared panel helpers; `DebugChannelsPanel.js` owns the debug channels panel; `DebugTraceToggle.js` owns console gating and the debug indicator; `DebugOverlay.js` owns runtime layer overlays; and `FormulaAndDebug.js` remains facade-only.
- `SelectionEngine.js` is only a facade; selection state, hit-testing, geometry, overlay rendering, and interaction flows live in dedicated `Selection*.js` owners.
- Selection DOM ownership is explicit: `#handles-layer`, `#selection-info`, `#sb-size`, `#rubber-band`, `.sel-box`, and `.sel-handle` are owned by `SelectionOverlay.js`.
- Selection state mutations stay canonical through `SelectionState.js`; hit resolution stays in `SelectionHitTest.js`; geometry stays in `SelectionGeometry.js`; pointer flows stay in `SelectionInteraction.js`.
- DocumentStore.js is only a facade; document state, selectors, actions, and history each have a dedicated owner module.
- Document selectors are read-only; document actions do not touch the DOM directly; document history owns snapshots and view sync after undo/redo.
- DS.state remains the single public source of truth for document runtime state.
- EngineCoreRouting.js is only a facade; pointer routing, zoom hooks, registry wiring, and workspace wiring live in dedicated owners.
- `reportforge/server/api.py` is only a facade; request contracts, helpers, and route groups live in dedicated `api_contracts.py`, `api_helpers.py`, and `api_routes_*.py` owners.
- FastAPI route families are separate owners: system, render, templates, tenants, designer validation/barcode, and datasources each have their own module.
- CR function families are separate owners: the catalog facade stays thin and each family module owns one concern.
- Datasource contracts are separate owners: cache, engine lifecycle, loader, queries, introspection, and registry must not be mixed in `db_source.py`.
- The datasource package itself is a thin facade: `__init__.py` only reexports the public API, `data_source.py` owns `DataSource`, and `multi_dataset.py` owns `MultiDataset`.
- Document store contracts are separate owners: state, selectors, actions, and history must not be mixed in `DocumentStore.js`.
- Engine core routing contracts are separate owners: pointer routing, zoom hooks, registry wiring, and workspace wiring must not be mixed in `EngineCoreRouting.js`.

## Testing

- Every architectural invariant has a dedicated guardrail test.
- Behavioral and parity tests cover real user flows.
- Regression tests must stay browser-aware where the runtime is browser-driven.
- Any new document-store split must be backed by guardrails for facade size, owner modules, and the DS source-of-truth contract.
