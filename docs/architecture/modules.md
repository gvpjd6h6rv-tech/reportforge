# Engine Module Reference — ReportForge v18.0

## CommandEngine

Implements all 84 designer commands with undo/redo integration.

**Categories:** FILE (8) · EDIT (7) · SELECTION (3) · MOVEMENT (8) · ALIGNMENT (6) · DISTRIBUTION (2) · ORDER (4) · GROUPING (2) · ZOOM (5) · VIEW (6) · GUIDES (4) · MARGINS (4) · SECTIONS (5) · OBJECT (4) · CANVAS (4) · INSERT (4) · FORMAT (4) · NAVIGATION (4)

**Key methods:**

```javascript
CommandEngine.copy()          // copy to DS.clipboard
CommandEngine.paste()         // paste with 8px offset
CommandEngine.delete()        // delete selected + saveHistory()
CommandEngine.bringFront()    // max zIndex + 1
CommandEngine.sendBack()      // min zIndex - 1
CommandEngine.bringForward()  // zIndex + 1
CommandEngine.sendBackward()  // zIndex - 1
CommandEngine.group()         // assign shared groupId
CommandEngine.invertSelection() // flip DS.selection
CommandEngine.zoomFitPage()   // scale to fit workspace
CommandEngine.zoomFitWidth()  // scale to fit width
CommandEngine.alignLefts()    // align to leftmost selected
CommandEngine.deleteSection() // remove section + its elements
CommandEngine.lockObject()    // set el.locked = true
CommandEngine.hideObject()    // set el.hidden = true
```

All mutating commands call `DS.saveHistory()` to push to the undo stack.

## DesignZoomEngine

```javascript
DesignZoomEngine.set(z, anchorX?, anchorY?)   // snap to ZOOM_STEPS, scroll-compensate
DesignZoomEngine.setFree(z, anchorX?, anchorY?) // continuous, no snap (wheel zoom)
DesignZoomEngine.zoomIn(ax?, ay?)              // next ZOOM_STEPS level
DesignZoomEngine.zoomOut(ax?, ay?)             // prev ZOOM_STEPS level
DesignZoomEngine.reset()                       // set(1.0)
DesignZoomEngine.get()                         // DS.zoom

ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
```

`set()` snaps to nearest step (±25–50% increments, for buttons).  
`setFree()` is used for wheel zoom (~10% per tick).

## DocumentStore (DS)

Global singleton — all state lives here.

```javascript
DS.elements[]          // all report elements
DS.sections[]          // report sections in order
DS.selection           // Set<id>
DS.clipboard           // array of JSON strings
DS.history[]           // undo stack entries
DS.historyIndex        // current position
DS.zoom                // current zoom level
DS.zoomDesign          // saved design-mode zoom
DS.zoomPreview         // saved preview-mode zoom
DS.previewMode         // boolean
DS.gridVisible         // boolean
DS.snapToGrid          // boolean

DS.getElementById(id)  // → element or null
DS.getSection(id)      // → section or null
DS.getSectionTop(id)   // → accumulated y offset
DS.getSectionAtY(y)    // → {section, relY}
DS.getTotalHeight()    // → sum of section heights
DS.getSelectedElements() // → array
DS.snap(v)             // → Math.round(v/8)*8
DS.saveHistory()       // push snapshot to history
DS.undo()              // restore previous snapshot
DS.redo()              // restore next snapshot
DS.subscribe(cb)       // observe state changes
DS.notify()            // trigger subscribers
```

## RF.Geometry

Cached per-frame geometry math.

```javascript
RF.Geometry.canvasRect()      // DOMRect of #canvas-layer
RF.Geometry.rulerVRect()      // DOMRect of #ruler-v
RF.Geometry.elementRect(div)  // {x,y,w,h} in canvas coords
RF.Geometry.sectionBand(div)  // {y,h} of section
RF.Geometry.rulerVTop()       // canvas top offset for ruler sync
RF.Geometry.toWorldX(clientX) // screen → document x
RF.Geometry.toWorldY(clientY) // screen → document y
RF.Geometry.invalidate()      // clear per-frame cache

RF.Geometry.MagneticSnap.snap(v, grid) // snap to grid, idempotent
```

## AlignmentGuides

Snap guide rendering in `#guide-layer` (position: fixed — not affected by viewport zoom).

```javascript
AlignmentGuides.show(elementId)  // render guides for element edges+centers
AlignmentGuides.clear()          // remove all guides
```

Guide classes: `.rf-guide.rf-guide-h` / `.rf-guide.rf-guide-v`  
Guides use `getBoundingClientRect()` in screen-space for pixel-perfect alignment.

## SelectionEngine

```javascript
SelectionEngine.renderHandles()    // facade -> SelectionOverlay
SelectionEngine.onPointerDown(e, id) // facade -> SelectionInteraction
SelectionEngine.onMouseMove(e)     // facade -> SelectionInteraction
SelectionEngine._doMove(pos, e)    // facade -> SelectionInteraction
SelectionEngine._doResize(pos, e)  // facade -> SelectionInteraction
```

Handles: 4 L-shaped black corner markers (`.sel-handle[data-pos="nw|ne|sw|se"]`), 1px border, 7×7px.

Selection ownership is split across:
- `GeometryCore.js`
- `CanvasGeometry.js`
- `SelectionState.js`
- `SelectionHitTest.js`
- `SelectionGeometry.js`
- `SelectionOverlay.js`
- `SelectionInteraction.js`
- `AlignEngine.js`
- `AlignmentGuides.js`

## PreviewEngine

```javascript
PreviewEngine.show()  // save DS.zoomDesign, restore DS.zoomPreview, add .preview-mode class
PreviewEngine.hide()  // save DS.zoomPreview, restore DS.zoomDesign, remove class
PreviewEngine.toggle()
```

Preview and Design maintain **independent zoom states** (`DS.zoomDesign`, `DS.zoomPreview`). Switching modes restores the previous zoom for that mode.

## OverlayEngine

```javascript
OverlayEngine.render()   // full re-render: rulers + handles + guides
```

Called by `DS.subscribe()` on any state change. Throttled via `requestAnimationFrame`.
