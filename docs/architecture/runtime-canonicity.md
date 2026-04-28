# Runtime Canonicity

## Decision Summary

- Canonical runtime today: `designer/crystal-reports-designer-v4.html`
- Canonical route today: `/`, `/designer`, `/classic`
- Canonical launcher today: `./run.sh` -> `reportforge_server.py` -> `/`
- Non-canonical runtime today: `reportforge/designer/index.html`
- Non-canonical route today: not served as `/`; only static path under `/reportforge/designer/`

## Evidence

- `reportforge_server.py` serves `/`, `/designer`, `/classic` through `_serve_designer()` and chooses `designer/crystal-reports-designer-v4.html` first.
  - [reportforge_server.py](/home/mimi/Escritorio/RF/reportforge_server.py#L30)
  - [reportforge_server.py](/home/mimi/Escritorio/RF/reportforge_server.py#L93)
  - [reportforge_server.py](/home/mimi/Escritorio/RF/reportforge_server.py#L138)
- `run.sh` starts `reportforge_server.py`, waits for `/health`, and opens `http://localhost:$PORT/`.
  - [run.sh](/home/mimi/Escritorio/RF/run.sh#L171)
  - [run.sh](/home/mimi/Escritorio/RF/run.sh#L180)
  - [run.sh](/home/mimi/Escritorio/RF/run.sh#L341)
- The modular designer exists as a separate HTML entrypoint with its own JS/CSS stack.
  - [reportforge/designer/index.html](/home/mimi/Escritorio/RF/reportforge/designer/index.html#L1)

## Runtime Status

### Canonical Temporal

- `designer/crystal-reports-designer-v4.html`
- Reason: it is the runtime that actually ships through `/` today.
- Operational status: `canonical temporal`

### Frozen

- `reportforge/designer/*`
- Reason: it is architecturally relevant, but it is not the runtime users reach through `run.sh`.
- Operational status: `frozen`

### Deprecated but Still Live

- `designer/crystal-reports-designer-v3.html`
- Reason: fallback runtime if v4 is absent.
- Operational status: `deprecated`

## Bridges Keeping Coexistence Alive

- legacy canvas facade removed; canonical canvas owner is `CanvasLayoutEngine`
  - [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7669)
- alternate selection bridge removed; canonical selection owner is `SelectionEngine`
  - [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7682)
- legacy preview facade removed; canonical preview owner is `PreviewEngineV19`
  - [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7721)
- Legacy DOM aliases and QA aliases
  - [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L6462)
  - [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L6488)
- Compatibility shim in snap path
  - [engines/SnapCore.js / SnapState.js](/home/mimi/Escritorio/RF/engines/SnapCore.js / SnapState.js#L144)

## Code Classification

| Area | Current Role | Operational Decision |
|---|---|---|
| `designer/crystal-reports-designer-v4.html` | Real runtime | Canonical temporal |
| `engines/*.js` | Runtime code loaded by canonical temporal | Canonical temporal |
| `reportforge/designer/*` | Alternate modular runtime | Frozen |
| `designer/crystal-reports-designer-v3.html` | Fallback legacy runtime | Deprecated |
| DOM aliases / shims / patches | Migration scaffolding | Remove after contract closure |

## Immediate Operating Decision

- Treat `designer/crystal-reports-designer-v4.html` + `engines/*.js` as the only runtime that may receive runtime-critical fixes.
- Freeze feature work in `reportforge/designer/*` until canonicity is explicitly switched.
- No new bridges, aliases, shims, or compatibility wrappers may be added to keep both runtimes alive.
