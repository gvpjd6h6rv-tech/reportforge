# Critical Contracts

## Contract Inventory

### 1. `elementRect`

- Shape actual observed in monolith:
  - `{ x, y, w, h }`
  - [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L2711)
- Variant conflictiva:
  - DOMRect-like `{ left, top, width, height }`
  - consumer logic still accepts this path in [engines/SelectionEngine.js](/home/mimi/Escritorio/RF/engines/SelectionEngine.js#L140)
- Producers:
  - `RF.Geometry.elementRect`
- Consumers:
  - `SelectionEngine.renderHandles`
  - selection bbox calculations
- Bug real causado:
  - selected overlay collapsed because consumer expected `left/top/width/height` while runtime provided `{x,y,w,h}`
- Shape canónico recomendado:
  - one explicit shape only: `{ x, y, w, h, space: "canvas-pretransform" }`

### 2. Zoom

- Shapes/owners actuales:
  - `DS.zoom`
  - `RF.Geometry.zoom()`
  - `DesignZoomEngine`
  - `ZoomEngineV19`
- Variantes conflictivas:
  - direct reads of `DS.zoom`
  - “canonical API” through geometry
- Producers:
  - `DesignZoomEngine`
  - `ZoomEngineV19.set/setFree`
- Consumers:
  - layout engines, selection, preview, rulers, grid, workspace scroll
- Bug real ya observado:
  - zoom pipeline requires wrappers and direct sync hooks to stay visually coherent
- Shape canónico recomendado:
  - `RF.Geometry.zoom()` as sole read API, one engine as sole write API

### 3. Selection overlay geometry

- Shape actual:
  - absolute overlay DOM in `#handles-layer`
  - box position from either measured rect or model fallback
  - [engines/SelectionEngine.js](/home/mimi/Escritorio/RF/engines/SelectionEngine.js#L133)
- Variantes conflictivas:
  - model-space fallback
  - DOMRect-like path
  - monolithic selection overlay path in HTML
- Producers:
  - `SelectionEngine.renderHandles`
  - legacy monolithic selection engine code
- Consumers:
  - resize hit-targets
  - visual overlay CSS
- Bug real ya causado:
  - box collapsed to `2x2` when geometry shape mismatched
- Shape canónico recomendado:
  - one overlay box contract: `{ x, y, w, h }` in view space only

### 4. Layout rects

- Shape actual:
  - sections from model heights
  - element rects from model + zoom
  - canvas contract from `CanvasLayoutEngine`
- Variantes conflictivas:
  - DOM measured rects vs model-derived rects
  - sync update paths vs scheduler paths
- Producers:
  - `CanvasLayoutEngine`
  - `SectionLayoutEngine`
  - `ElementLayoutEngine`
  - `RF.Geometry`
- Consumers:
  - selection
  - rulers
  - preview
  - workspace scroll
- Bug real ya causado:
  - repeated need for direct-canvas-sync and direct-section-sync hooks
- Shape canónico recomendado:
  - layout contract objects versioned and emitted by layout engines only

### 5. DOM contract de elemento

- Shapes actuales:
  - canonical real runtime DOM: `.cr-element[data-id][data-type]`
  - alternate modular DOM contract with independent identifiers
- Variantes conflictivas:
  - alias injection over `.cr-element`
  - alternate selection layer names
- Producers:
  - monolith canvas engine
  - `CanvasLayoutEngine`
  - modular designer `elements.js`
- Consumers:
  - selection
  - QA scripts
  - geometry
  - preview sync
- Bug real ya causado:
  - tool/test expectations had to be kept alive via DOM aliases
- Shape canónico recomendado:
  - one element DOM only; no aliasing in runtime

### 6. Handles / overlay contract

- Shape actual:
  - `#handles-layer > .sel-box + 8 .sel-handle`
  - modular runtime uses `#sel-layer`
- Variantes conflictivas:
  - monolith HTML overlay implementation
  - `engines/SelectionEngine.js`
  - modular overlay contract
- Producers:
  - `SelectionEngine.renderHandles`
  - modular `core/selection.js`
- Consumers:
  - resize interactions
  - UI visual selection state
- Bug real ya causado:
  - 4 vs 8 handles and geometry mismatch during runtime v4 fixes
- Shape canónico recomendado:
  - one overlay root, one box, one hit-target contract, one visual contract

## Immediate Contract Rule

- No new consumer may accept two shapes for the same contract.
- If a runtime contract is ambiguous today, the ambiguity must be documented before any new feature work lands on top.
