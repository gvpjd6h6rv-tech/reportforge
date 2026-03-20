# Engine Modules — ReportForge v19

## Overview

v19 introduces four dedicated engine modules under `/engines/`.
All engines follow the RF.Geometry coordinate contract.

---

## WorkspaceScrollEngine

**File:** `engines/WorkspaceScrollEngine.js`

Manages the workspace scroll container so it always accommodates
the scaled canvas dimensions.

```js
WorkspaceScrollEngine.update()        // batched via rAF
WorkspaceScrollEngine.updateSync()    // immediate
WorkspaceScrollEngine.getGeometry()   // → {scaledW, scaledH, padding}
```

**Triggers:** `rf:zoom-changed`, `ResizeObserver` on `#canvas-layer`, `window.resize`

---

## GridEngine

**File:** `engines/GridEngine.js`

Zoom-aware background dot grid.

```js
GridEngine.init()
GridEngine.update()          // batched
GridEngine.setVisible(bool)
GridEngine.toggle()
GridEngine.getGridPx()       // → RF.Geometry.scale(GRID_BASE_MODEL)
GridEngine.GRID_BASE_MODEL   // = 10 (model units)
```

**Key formula:**
```js
overlay.style.backgroundSize = RF.Geometry.scale(GRID_BASE_MODEL) + 'px ' + ...
```

Auto-hides when `RF.Geometry.scale(10) < 3px`.

---

## SnapEngine

**File:** `engines/SnapEngine.js`

All snap operations in MODEL SPACE.

```js
SnapEngine.init()
SnapEngine.snap(modelValue)            // → snapped model value
SnapEngine.snapPoint(modelX, modelY)   // → {x,y} snapped model
SnapEngine.snapFromClient(cx, cy)      // → {x,y} view px (full pipeline)
SnapEngine.getAlignmentGuides(el, threshold) // → guide candidates
SnapEngine.setEnabled(bool)
SnapEngine.setGrid(modelUnits)
```

**Pipeline:**
```
clientXY → RF.Geometry.viewToModel → snap(model) → RF.Geometry.modelToView → DOM
```

`DS.snap` is shimmed to `SnapEngine.snap` for legacy compatibility.

---

## RulerEngine

**File:** `engines/RulerEngine.js`

DPR-correct ruler canvas rendering. Replaces `OverlayEngine` ruler methods.

```js
RulerEngine.render()           // batched via rAF
RulerEngine.renderSync()       // immediate (boot only)
RulerEngine.updateCursor(x, y) // model coords → crosshair
RulerEngine.clearCursor()
// Constants:
RulerEngine.H_RULER_H  // = 16
RulerEngine.V_TOTAL_W  // = 22
RulerEngine.V_GUTTER_W // = 14
RulerEngine.V_TICK_W   // = 8
```

**Canvas setup (DPR-correct):**
```js
const dpr = window.devicePixelRatio;
canvas.width  = cssW * dpr;
canvas.style.width = cssW + 'px';
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
```

**Tick positions:**
```js
const x = canvasOffX + RF.Geometry.scale(modelUnit);
```

---

## Boot Wiring

```js
// DOMContentLoaded — ORDER IS CRITICAL
// 1. OverlayEngine → RulerEngine (before _apply patch)
OverlayEngine.render = () => { RF.Geometry.invalidate(); RulerEngine.render(); };

// 2. Patch _apply to fire rf:zoom-changed
DesignZoomEngine._apply = function(z, ax, ay) {
  _origApply(z, ax, ay);
  workspace.dispatchEvent(new CustomEvent('rf:zoom-changed', { detail: { zoom: z } }));
};

// 3. SnapEngine + DS.snap shim
SnapEngine.init();
DS.snap = (v) => SnapEngine.snap(v);

// 4. GridEngine, WorkspaceScrollEngine
GridEngine.init();
WorkspaceScrollEngine.init();
```
