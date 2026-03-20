# ReportForge Architecture — v19.0

> **Current version:** v19.0 — Modular Engine Architecture

## Engine Layer (`/engines/`)

v19 introduces dedicated engine modules. Each engine owns one concern and
communicates via the `rf:zoom-changed` custom event.

```
/engines/
  WorkspaceScrollEngine.js   — scroll container sizing
  GridEngine.js              — zoom-aware dot grid
  SnapEngine.js              — model-space snap pipeline
  RulerEngine.js             — DPR-correct ruler canvas (rewrite)
```

## Coordinate Spaces

| Space | Units | Owner |
|-------|-------|-------|
| MODEL | document px | `DS.elements` |
| VIEW | `model × zoom` | DOM styles |
| SCREEN | `view × dpr` | Canvas buffers |

Conversions: **only through `RF.Geometry`**.
`DS.zoom` is read only by `RF.Geometry.zoom()`.

## Zoom Pipeline

```
DesignZoomEngine._apply(z)
    ↓ DS.zoom = z
    ↓ RF.Geometry.scale/modelToView for all DOM writes
    ↓ fires  rf:zoom-changed
         ↓ GridEngine        → backgroundSize
         ↓ WorkspaceScroll   → scroll geometry
    ↓ RulerEngine.render()   → tick positions via RF.Geometry.scale()
    ↓ PreviewEngine.refresh() if previewMode
```

---

## Geometry Engine (v18.10+)

All coordinate conversions go through `RF.Geometry` — the single source of truth for zoom.

### Rule: DS.zoom is only read by RF.Geometry.zoom()

```
MODEL SPACE  — DS.elements coordinates (document px, never scaled)
VIEW SPACE   — DOM pixels = RF.Geometry.scale(model)
MOUSE INPUT  — RF.Geometry.viewToModel(clientX, clientY) → model coords
SNAP         — operates in model space only
RULERS       — RF.Geometry.scale(unit) for all tick positions
PREVIEW      — RF.Geometry.rectToView(el) for all element positioning
```

### API

| Method | Description |
|--------|-------------|
| `RF.Geometry.zoom()` | Returns current `DS.zoom` |
| `RF.Geometry.scale(v)` | `v × zoom` — model to view |
| `RF.Geometry.unscale(v)` | `v / zoom` — view to model |
| `RF.Geometry.modelToView(x, y)` | Point: model → view |
| `RF.Geometry.viewToModel(clientX, clientY)` | Client → model (canvas-relative) |
| `RF.Geometry.rectToView({x,y,w,h})` | Rect: model → view |

---

# Architecture Overview — ReportForge v18.0

## Four-Layer Layout Architecture

The designer enforces a strict separation of concerns across four layers:

```
┌─────────────────────────────────────────┐
│  VIEWPORT  (#viewport)                  │
│  Responsibility: zoom transform, scroll │
│  transform: scale(z) — ONLY here        │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  WORKSPACE  (#workspace)          │  │
│  │  Responsibility: UI layout        │  │
│  │  Contains: rulers, guides, canvas │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  CANVAS  (#canvas-layer)    │  │  │
│  │  │  Responsibility: rendering  │  │  │
│  │  │  offsetWidth: 754px always  │  │  │
│  │  │                             │  │  │
│  │  │  ┌───────────────────────┐  │  │  │
│  │  │  │  DOCUMENT             │  │  │  │
│  │  │  │  sections, objects    │  │  │  │
│  │  │  │  coordinates in px    │  │  │  │
│  │  │  └───────────────────────┘  │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Layout Formula

All canvas positioning derives from one formula:

```
canvasX = rulerWidth  + pageMarginLeft    (= 196px at default margins)
canvasY = rulerHeight + pageMarginTop     (= 184px at default margins)
```

This is enforced by `#canvas-row` flexbox order — `#ruler-v` is always the first flex child, `#workspace` the second. No mode-specific offsets exist.

## Zoom Architecture

Zoom is applied **exclusively** to `#viewport`:

```javascript
viewport.style.transform = `scale(${z})`  // ONLY zoom target
canvas.style.transform = 'none'           // NEVER scaled
canvas.offsetWidth === 754                 // invariant at ALL zoom levels
```

`DesignZoomEngine.set(z)` snaps to ZOOM_STEPS for buttons (~25% increments).  
`DesignZoomEngine.setFree(z)` bypasses snap for wheel zoom (~10% increments).

## DOM Structure

```html
<div id="canvas-area">
  <div id="ruler-h-row">
    <div id="ruler-corner"></div>
    <canvas id="ruler-h-canvas"></canvas>
  </div>
  <div id="canvas-row">
    <div id="ruler-v">
      <canvas id="ruler-v-inner"></canvas>
    </div>
    <div id="workspace">
      <div id="viewport">
        <div id="canvas-layer">
          <!-- sections, elements, guides, handles -->
        </div>
      </div>
      <div id="guide-layer"><!-- snap guides (position:fixed) --></div>
    </div>
  </div>
</div>
```

**Critical rule:** `#ruler-v` and `#ruler-h-canvas` must NEVER be inside `#viewport`. They exist in screen space and must not be affected by zoom transform.

## Engine Modules

| Module | Responsibility |
|--------|---------------|
| `DocumentStore (DS)` | Central state: elements, sections, history, zoom, selection |
| `CanvasEngine` | DOM rendering of elements and sections |
| `SelectionEngine` | Selection handles, resize, drag |
| `DesignZoomEngine` | Zoom state with viewport transform |
| `AlignmentGuides` | Snap guide rendering (position:fixed overlay) |
| `CommandEngine` | 84 commands with undo/redo integration |
| `OverlayEngine` | Rulers, handles, guides render loop |
| `RulerEngine` | Ruler canvas drawing with scroll sync |
| `PreviewEngine` | Mode switch: design ↔ preview |
| `InsertEngine` | Element insertion tools |
| `FormatEngine` | Toolbar sync with selection state |
| `RF.Geometry` | World-coord math, MagneticSnap, cached DOMRects |

## State Model

```javascript
DS = {
  zoom: 1.0,          // current zoom (shared reference)
  zoomDesign: 1.0,    // saved design zoom (restored on preview→design)
  zoomPreview: 1.0,   // saved preview zoom (restored on design→preview)
  previewMode: false,
  elements: [],       // {id, type, x, y, w, h, sectionId, zIndex, ...}
  sections: [],       // {id, stype, height, label, visible}
  selection: Set,     // selected element IDs
  clipboard: [],      // copied element JSONs
  history: [],        // undo stack
  historyIndex: 0,
  gridVisible: true,
  snapToGrid: true,
}
```

## Layout Invariants (enforced by repo-layout-invariants.sh)

```
INV-01  canvasLeft >= verticalRulerRight
INV-02  canvasTop >= horizontalRulerBottom
INV-03  workspaceLeft == verticalRulerRight
INV-04  canvas.transform === 'none'
INV-05  verticalRuler visible (offsetWidth > 0)
INV-06  horizontalRuler visible (width > 0)
INV-07  canvas offsetWidth === 754px
INV-08  canvas never overlaps ruler
INV-09  workspace never overlaps ruler
INV-10  zoom ∈ [0.25, 4.0]
INV-11  ruler-v-inner height >= workspace.clientHeight
INV-12  DS.elements.length > 0
```

These are validated across 6 scenarios: baseline, zoom×2, zoom×0.5, selection, preview, 30-op stress.

## Repository Structure

```
reportforge-complete/
├── designer/
│   └── crystal-reports-designer-v4.html   # ~270KB, single-file designer
├── sandbox/
│   ├── god-level-qa.js                     # 955 engine tests
│   └── full-verification.js                # 66 runtime checks
├── repo-*.sh                               # 43 QA scripts
├── repo-super.sh                           # Master orchestrator (7 groups)
├── docs/
│   ├── architecture/
│   │   ├── overview.md       ← this file
│   │   ├── modules.md        # Engine module API reference
│   │   ├── events.md         # DS.subscribe event system
│   │   └── render.md         # Python render pipeline
│   ├── guide/
│   │   ├── getting-started.md
│   │   ├── designer.md
│   │   ├── shortcuts.md
│   │   ├── sections.md
│   │   └── formulas.md
│   └── api/                  # REST API reference
└── reportforge/
    ├── core/render/           # Python render engine
    └── server/                # FastAPI REST server
```
