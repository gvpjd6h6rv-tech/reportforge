# Selection Engine Contract

`SelectionEngine.js` is a facade only.

## Owners

- `SelectionState.js`
  - owns canonical access to `DS.selection`
  - owns selection mutation helpers
- `SelectionHitTest.js`
  - owns pointer hit resolution and render selection resolution
- `GeometryCore.js`
  - owns primitive rect and point math used by selection flows
- `CanvasGeometry.js`
  - owns canvas/view transforms used by selection rendering
- `SelectionGeometry.js`
  - owns bbox, bounds, handles, and rubber-band calculations
- `SelectionOverlay.js`
  - owns handles, selection box, overlay render, and selection status DOM
- `SelectionInteraction.js`
  - owns pointer-driven drag, resize, text-edit, and rubber-band flows
- `AlignEngine.js`
  - owns alignment actions
- `AlignmentGuides.js`
  - owns snap guide overlay rendering

## DOM Contracts

- `#handles-layer`
- `#selection-info`
- `#sb-size`
- `#rubber-band`
- `.sel-box`
- `.sel-handle`
- `.selected`

## Invariants

- One writer for the selection overlay DOM.
- One owner for the selection state.
- Hit-test stays separate from render.
- Geometry stays separate from interaction.
- Primitive geometry stays separate from canvas/selection domain geometry.
- Facades stay thin and free of heavy logic.
- Legacy bridge behavior stays out of the canonical runtime.
