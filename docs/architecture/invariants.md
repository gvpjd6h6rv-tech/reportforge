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

## Runtime

- Selection, canvas, preview, zoom, and history each have a single canonical owner.
- Scheduler-driven DOM writes only.
- Geometry contracts are shape-stable.
- Safe mode and recovery must remain explicit and observable.

## Testing

- Every architectural invariant has a dedicated guardrail test.
- Behavioral and parity tests cover real user flows.
- Regression tests must stay browser-aware where the runtime is browser-driven.
