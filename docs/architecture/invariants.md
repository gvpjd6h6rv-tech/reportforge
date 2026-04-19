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
- `reportforge_server.py` is only the HTTP facade and entrypoint; route logic lives in service modules.
- Each server route has a single owner module: health, favicon, designer shell, static assets, barcode, preview, render, validate, and datasources are all separate files.

## Runtime

- Selection, canvas, preview, zoom, and history each have a single canonical owner.
- Geometry is split by concern: `GeometryCore.js` owns pure primitives; `CanvasGeometry.js` owns canvas/page transforms; `SelectionGeometry.js` owns selection bounds, handles, and rubber-band math; `HitTestGeometry.js` owns pure hit-testing predicates.
- Geometry modules do not write DOM, mutate DS, or depend on scheduler state.
- Scheduler-driven DOM writes only.
- Geometry contracts are shape-stable.
- Safe mode and recovery must remain explicit and observable.
- The designer shell must carry `data-dom-owner` tags on `#app`, `#main-area`, `#panel-left`, `#canvas-area`, `#workspace`, and `#panel-right`.
- CSS ownership is split between host and panels: host width, panel widths, and canvas width contracts are separately owned and must not bleed across boundaries.
- Layout drift is a failing condition: shell DOM order and width contracts are asserted in tests, not inferred from visual inspection.
- Writer conflicts are recorded in `docs/architecture/writer-conflict-log.md` and treated as durable architectural debt until explicitly retired.
- `CommandRuntime.js` is only a facade; the command, view, file, doc-type, handler, and init responsibilities live in dedicated `CommandRuntime*.js` owners.
- `UIAdapters` and `MenuAdapters` remain the only DOM wiring owners for command dispatch, while `CommandRuntime` stays free of direct event listener registration.
- `RenderScheduler.js` is only a facade; state, frame flush, queueing, and DOM write scope guards live in dedicated `RenderScheduler*.js` owners.
- The scheduler is the sole canonical writer gate: no engine may bypass `RenderScheduler` for DOM scheduling or write-scope checks.
- `CanvasLayoutEngine.js` is only a facade; contract helpers, size updates, and element DOM writing live in dedicated `CanvasLayout*.js` owners.
- Canvas element DOM and canvas layer sizing are separate writer responsibilities with separate contracts and tests.
- `PreviewEngineV19` is only a facade; preview DOM contracts, data resolution, mode toggling, and renderer logic live in dedicated `PreviewEngine*.js` owners.
- Preview DOM is explicit: `#preview-layer` and `#preview-content` are required contracts and must be asserted in tests.
- `SelectionEngine.js` is only a facade; selection state, hit-testing, geometry, overlay rendering, and interaction flows live in dedicated `Selection*.js` owners.
- Selection DOM ownership is explicit: `#handles-layer`, `#selection-info`, `#sb-size`, `#rubber-band`, `.sel-box`, and `.sel-handle` are owned by `SelectionOverlay.js`.
- Selection state mutations stay canonical through `SelectionState.js`; hit resolution stays in `SelectionHitTest.js`; geometry stays in `SelectionGeometry.js`; pointer flows stay in `SelectionInteraction.js`.

## Testing

- Every architectural invariant has a dedicated guardrail test.
- Behavioral and parity tests cover real user flows.
- Regression tests must stay browser-aware where the runtime is browser-driven.
