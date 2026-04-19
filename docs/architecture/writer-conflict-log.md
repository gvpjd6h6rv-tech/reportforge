# Writer Conflict Log

This log records the active writer boundaries that are easy to regress.
Each entry is a durable reminder that one file owns one write path.

## Active Contracts

| Area | Canonical owner | Conflict to watch | Assertion |
|---|---|---|---|
| Shell CSS bleed | `designer/crystal-reports-designer-v4.html` + `designer/styles/*.css` | inline styles or host-level selectors that leak into panel/canvas scope | host vs panel width contract test |
| Host width | `#app` / `#main-area` | any writer that changes shell width outside the layout grid | layout drift assertion |
| Left panel width | `#panel-left` | any non-panel writer that mutates panel width | panel ownership tag test |
| Canvas host width | `#canvas-area` / `#workspace` | any panel writer that affects canvas layout directly | canvas ownership tag test |
| Right panel width | `#panel-right` | any non-panel writer that mutates the inspector column | panel ownership tag test |
| DOM ownership | shell root and main regions | missing `data-dom-owner` tags or duplicated owners | DOM ownership tag test |
| Command dispatch | `CommandRuntime.js` facade | command logic or DOM listeners reintroduced into the facade | command runtime split test |
| Render scheduling | `RenderScheduler.js` facade | queueing, flush, or write-scope logic reintroduced into the facade | render scheduler split test |
| Canvas layout | `CanvasLayoutEngine.js` facade | element writer or size writer logic reintroduced into the facade | canvas layout split test |
| Preview rendering | `PreviewEngineV19` facade | data resolver, mode toggle, or renderer logic reintroduced into the facade | preview engine split test |
| Selection state | `SelectionState.js` | any other module mutating `DS.selection` directly | selection state contract test |
| Geometry core | `GeometryCore.js` | DOM, DS, scheduler, or selection logic leaking into primitive geometry | geometry core contract test |
| Selection hit-testing | `SelectionHitTest.js` | render or interaction code re-deriving hit targets inline | selection hit-test contract test |
| Selection geometry | `SelectionGeometry.js` | interaction code re-deriving bounds or rect unions inline | selection geometry contract test |
| Selection overlay | `SelectionOverlay.js` | any other writer that touches `#handles-layer`, `.sel-box`, or `.sel-handle` | selection overlay contract test |
| Selection interaction | `SelectionInteraction.js` | render layer or state layer owning pointer flows | selection interaction contract test |

## Notes

- If a new writer appears, add it here before the split is accepted.
- If a contract is retired, leave a short deprecation note and the removal date.
