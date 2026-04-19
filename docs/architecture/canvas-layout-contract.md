# Canvas Layout Contract

`CanvasLayoutEngine` is a facade only.

## Owners

- `CanvasLayoutContracts.js`: contract guard helpers.
- `CanvasLayoutSize.js`: canvas layer sizing and layout contract reporting.
- `CanvasLayoutElements.js`: element DOM writer and element update paths.
- `CanvasLayoutEngine.js`: public facade and export surface.

## Public API

- `CanvasLayoutEngine.buildElementDiv()`
- `CanvasLayoutEngine.renderElement()`
- `CanvasLayoutEngine.renderAll()`
- `CanvasLayoutEngine.updateElement()`
- `CanvasLayoutEngine.updateElementPosition()`
- `CanvasLayoutEngine.update()`
- `CanvasLayoutEngine.updateSync()`
- `CanvasLayoutEngine.getMetrics()`
- `CanvasLayoutEngine.getLayoutContract()`

## Notes

- Canvas sizing owns the `#canvas-layer` dimensions.
- Element writing owns `.cr-element` creation and updates.
- Both paths must remain scheduler-gated.
