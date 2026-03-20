## v19.5.0 (2026-03-16) — Phase 3.2: Engine Consolidation

### Changes

**EngineCore._registerAllEngines** — rewritten:
- Replaced `new Function` / `window` scanning with explicit `typeof X !== 'undefined' ? X : null`
- Every engine referenced directly by identifier — no dynamic discovery
- Responsibility ownership documented in code comments

**EngineCore._E()** — registry-only:
- Removed `|| window[name]` fallback
- All engine access is strictly `EngineRegistry.get(name)`

**EngineCore._patchZoomEngine** — uses registry:
- `const DesignZoomEngine = EngineRegistry.get('DesignZoomEngine')`

**Responsibility ownership** (one active engine per concern):

| Concern | Owner | Note |
|---------|-------|------|
| Selection | `SelectionEngine` (monolithic) | Owns all drag/resize/rubber-band |
| Overlay | `OverlayEngineV19` → `RulerEngine` | Single patch on `OverlayEngine.render` |
| Canvas | `CanvasEngine` (monolithic) | Owns `buildElementDiv` |
| Preview | `PreviewEngine` (monolithic) | Owns HTML generation |

**Duplicate event handlers removed:**
- Phase 2 `ws.addEventListener('pointermove')` → removed (EngineCore owns this)
- `SelectionEngineV19` confirmed clean: no `addEventListener` calls (facade only)

### Verification

```
Registry total:          37 engines
v19 engines (21/21):     ✅ ALL
selection owner:         ✅ SelectionEngine (monolithic)
overlay owner:           ✅ OverlayEngineV19 → RulerEngine
canvas owner:            ✅ CanvasEngine (monolithic)
preview owner:           ✅ PreviewEngine (monolithic)
EngineCore registry-only:✅
SelectionEngineV19 clean:✅ no addEventListener
Snap 17→16:              ✅
Geometry (100%):         ✅
HitTest:                 ✅
```

---
## v19.4.0 (2026-03-16) — EngineCore, Full Registry, Orchestration

### EngineCore (new — `engines/EngineCore.js`)
- Central orchestrator: routes pointer events, coordinates engine lifecycle
- Full pipeline: `pointer → screenToModel → HitTest → Snap → Drag → Layout → Overlay`
- `onZoomWillChange` → `WorkspaceScrollEngine.adjustForZoom` (scroll anchor preserved)
- `onZoomDidChange` → LAYOUT → VISUAL → HANDLES → POST in `RenderScheduler` order

### EngineRegistry (part of EngineCore)
- `EngineRegistry.register(name, instance)` — consistent engine access
- `EngineRegistry.get(name)` — retrieve by name
- `EngineRegistry.list()` — enumerate all registered engines
- Uses `new Function` eval to find `const` globals (not on `window`)
- **37 engines registered**: 21 v19 modular + 16 monolithic

### RenderScheduler (upgraded v19.4)
- Deduplication by string key — same task scheduled twice in one frame collapses to one call
- Four priority queues: `LAYOUT(0) → VISUAL(1) → HANDLES(2) → POST(3)`
- All Phase 1-3 engines migrated: GridEngine, RulerEngine, CanvasEngineV19, SectionLayoutEngine, ElementLayoutEngine → route through `RenderScheduler.layout/visual`

### WorkspaceScrollEngine (upgraded)
- `adjustForZoom(prevZoom, newZoom)` — preserves visual centre on zoom change
- Called by EngineCore before zoom is applied

### Phase 3 new engines
- `CanvasEngineV19` — canvas-layer size management (renamed to avoid conflict with monolithic CanvasEngine)
- `SectionLayoutEngine` — section height/width via `RF.Geometry.scale()`
- `ElementLayoutEngine` — sub-pixel element positioning; `moveElement()`, `resizeElement()`
- `PreviewEngineV19` — preview facade with `RF.Geometry` metrics
- `OverlayEngineV19` — unified overlay compositor routing to `RulerEngine`
- `HistoryEngine` — undo/redo with named actions, `suppress()` for batch updates
- `KeyboardEngine` — full shortcut dispatcher (Ctrl+Z/Y, arrows, delete, zoom, grid, snap)
- `ClipboardEngine` — copy/paste/duplicate with model-space snapshots

### RF.Geometry Phase 3 additions
- `modelToScreen(x, y)` → physical pixels (includes DPR + scroll)
- `screenToModel(sx, sy)` → model coords from physical pixels
- `snapModel(v, grid)` → floating-point snap, rounds only at output
- `roundView(v)` → `Math.round(v)` for CSS assignment
- Zoom range extended: `0.01 – 64` (infinite zoom, continuous, no step-snap for programmatic set)

---

## Verification — EngineRegistry

```
Total: 37 engines registered

v19 modular (21):
  AlignmentEngine, CanvasEngineV19, ClipboardEngine, DragEngine,
  ElementLayoutEngine, EngineCore, GridEngine, GuideEngine, HandlesEngine,
  HistoryEngine, HitTestEngine, KeyboardEngine, OverlayEngineV19,
  PreviewEngineV19, RenderScheduler, RulerEngine, SectionLayoutEngine,
  SelectionEngineV19, SnapEngine, WorkspaceScrollEngine, ZoomEngineV19

Monolithic (16):
  CanvasEngine, CFG, CommandEngine, DesignZoomEngine, DS, EngineRegistry,
  FormatEngine, InsertEngine, OverlayEngine, PreviewEngine, PreviewZoomEngine,
  PropertiesEngine, RF, SectionResizeEngine, SelectionEngine, ZoomWidget
```

---
## v19.0.0 (2026-03-16) — Engine Architecture Refactor

### Architecture

ReportForge v19 introduces a formal engine module system under `/engines/`.
The rendering pipeline is now structured around four dedicated engines,
each with a strict coordinate-space contract.

**Coordinate spaces:**
```
MODEL SPACE  — DS.elements coordinates (document px, zoom-invariant)
VIEW SPACE   — MODEL × RF.Geometry.zoom()  (DOM px)
SCREEN SPACE — VIEW × devicePixelRatio     (physical px)
```

**Rule enforced:** `DS.zoom` is only read by `RF.Geometry.zoom()`.
No engine may multiply by `DS.zoom` directly.

### New engines (`/engines/`)

**`WorkspaceScrollEngine.js`**
- Manages workspace scroll container geometry
- Sizes viewport relative to scaled canvas via `RF.Geometry.scale()`
- Triggers on zoom change (`rf:zoom-changed`), resize, section layout change
- `ResizeObserver` on `#canvas-layer` for automatic updates

**`GridEngine.js`**
- Zoom-aware dot grid overlay
- Base grid: `GRID_BASE_MODEL = 10px` (model space)
- View grid: `backgroundSize = RF.Geometry.scale(10) + 'px'`
- Auto-hides below `MIN_GRID_PX = 3` (prevents visual clutter at low zoom)
- Updates via `rf:zoom-changed` custom event

**`SnapEngine.js`**
- All snap operations in MODEL SPACE — never view space
- Pipeline: `clientXY → viewToModel → snap(model) → modelToView → DOM`
- `DS.snap` shimmed to `SnapEngine.snap` for legacy compatibility
- Alignment guide candidates computed in model space
- `getAlignmentGuides(el, threshold)` for magnetic snap overlays

**`RulerEngine.js`** (complete rewrite of `OverlayEngine` ruler drawing)
- DPR-correct canvas: `canvas.width = cssW * dpr; ctx.setTransform(dpr,0,0,dpr,0,0)`
- Tick positions: `RF.Geometry.scale(modelUnit)` — no raw math
- Adaptive tick density: step=5 at z≥3.0, step=10 at z≥1.5, step=20 otherwise
- Cursor crosshair overlay (H + V rulers)
- `rAF`-batched rendering — multiple rapid calls collapse to one frame
- Section gutter: colour-coded bands, abbreviated labels, section dividers
- `renderSync()` for initial boot pass

### Boot wiring (`crystal-reports-designer-v4.html`)

Four `<script src="/engines/...">` tags load the modules.
A `DOMContentLoaded` boot block (ordered precisely to avoid timing issues):
1. Wire `OverlayEngine.render → RulerEngine.render` **first**
2. Patch `DesignZoomEngine._apply` to fire `rf:zoom-changed`
3. Initialize `SnapEngine` + shim `DS.snap`
4. Initialize `GridEngine`, `WorkspaceScrollEngine`
5. Trigger initial render pass

### Zoom pipeline

```
DesignZoomEngine._apply(z)
    ↓ DS.zoom = z  (only write point)
    ↓ updates canvas/sections/elements/font via RF.Geometry
    ↓ fires rf:zoom-changed event
         ↓ GridEngine.update()             → backgroundSize rescaled
         ↓ WorkspaceScrollEngine.update()  → scroll geometry updated
    ↓ calls OverlayEngine.render()
         ↓ RulerEngine.render()            → DPR-correct rulers redrawn
    ↓ PreviewEngine.refresh() if previewMode  → preview re-rendered
```

### Verification (5/5 zoom levels)

| Zoom | Grid bg-size | Ruler DPR | Snap 17→16 | Canvas | Geom |
|------|-------------|-----------|-----------|--------|------|
| 50%  | `5×5px` ✅ | 22px/44✅ | ✅ | 377 ✅ | ✅ |
| 100% | `10×10px` ✅ | 22px/44✅ | ✅ | 754 ✅ | ✅ |
| 150% | `15×15px` ✅ | 22px/44✅ | ✅ | 1131 ✅ | ✅ |
| 300% | `30×30px` ✅ | 22px/44✅ | ✅ | 2262 ✅ | ✅ |
| 400% | `40×40px` ✅ | 22px/44✅ | ✅ | 3016 ✅ | ✅ |

---

## v18.14 (2026-03-16) — Preview Renderer Geometry Unification

### Preview renderer now uses RF.Geometry pipeline

- **`_renderElementData`**: replaced raw `el.x/y/w/h` model coords and `fontSize pt` with
  `RF.Geometry.rectToView(el)` and `RF.Geometry.scale(el.fontSize * 96/72) + 'px'`
- **`_renderInstanceElement`**: same conversion — view-space coords and scaled font
- **`_renderBand`**: section `height` and `width` now use `RF.Geometry.scale()`
- **`_renderSectionData`**: same as `_renderBand`
- Preview now scales proportionally at all zoom levels: 50%, 100%, 150%, 400% ✅

---

## v18.13 (2026-03-16) — [Skipped / renumbered as v18.14]

---

## v18.12 (2026-03-16) — Section Width Scaling + Font Rendering Fix

### Section width gap resolved

- **`SectionEngine.render()`**: `div.style.width = '100%'` → `RF.Geometry.scale(CFG.PAGE_W) + 'px'`
  White gap to the right of canvas at zoom > 100% eliminated
- **`SectionEngine` container**: `CFG.PAGE_W + 'px'` → `RF.Geometry.scale(CFG.PAGE_W) + 'px'`
- **`DesignZoomEngine._apply()` section loop**: added explicit `div.style.width` scaling

### Font scaling fixed

- **`buildElementDiv()`**: `el.fontSize + 'pt'` → `RF.Geometry.scale(el.fontSize * 96/72) + 'px'`
  Converts pt → px at 96dpi then scales with zoom
- **`DesignZoomEngine._apply()` element loop**: added `div.style.fontSize` update on zoom change
- **CSS `.el-content`**: removed `font-size: 7.5px` hard override; added `line-height: 1`
- **CSS `.el-field-icon`**: removed `font-size: 8px`; now inherits from scaled parent; added `line-height: 1`
- **CSS `.ruler-num`**: `font-size: 7px` → `10px; font-weight: 600`

---

## v18.11 (2026-03-16) — Geometry Engine Finalization

### Eliminated all DS.zoom access outside RF.Geometry

- **`SectionResizeEngine`** dy: `/ DS.zoom` → `RF.Geometry.unscale()`
- **`renderHRuler()`** step: `DS.zoom >= 1.5` → `RF.Geometry.zoom() >= 1.5`
- **`renderVRuler()`** fallback height, step, loop bound: all use `RF.Geometry.scale/unscale/zoom()`
- **`pvContent` drag** dx/dy: `/ DS.zoom` → `RF.Geometry.unscale()`
- **`pvLayer` drag** z capture: removed; uses `RF.Geometry.unscale()` directly
- **`__rfVerify`** QA probe: `const zoom = DS.zoom||1; x/zoom` → `RF.Geometry.unscale(x)`
- Result: 0 render-path `DS.zoom` references outside `RF.Geometry`

---

## v18.10 (2026-03-16) — Unified RF.Geometry Engine

### New RF.Geometry methods

```js
zoom()                        // → DS.zoom (single read point)
scale(v)                      // → v × zoom  (model → view scalar)
unscale(v)                    // → v / zoom  (view → model scalar)
modelToView(x, y)             // → {x, y} in DOM pixels
viewToModel(clientX, clientY) // → {x, y} in document units
rectToView({x,y,w,h})         // → rect scaled to view space
```

### 13 call sites migrated to RF.Geometry

- `CanvasEngine.buildElementDiv()`, `updateElementPosition()`
- `SectionEngine.render()`
- `SelectionEngine._doMove()`
- `SectionResizeEngine.onMouseMove()` RAF
- `DesignZoomEngine._apply()` — sections, elements, canvas height
- `renderHRuler()` ticks, `renderVRuler()` ticks + section bands
- `RF.Geometry.toCanvasSpace()` — delegates to `viewToModel()`
- Preview-drag design element update

---

## v18.9 (2026-03-16) — Zoom Rendering Fix

- **Preview-drag handler**: `el.x/y + 'px'` → `el.x/y * DS.zoom + 'px'`
  Fixed element jumping to wrong position when dragged from preview at zoom ≠ 1.0

---

## v18.8 (2026-03-16) — Zoom + Ruler UX Fix

### Architecture rule enforced (v18.7 follow-up)

- **`buildElementDiv()`**: `el.x/y/w/h` → `el.x/y/w/h * DS.zoom`
- **`updateElementPosition()`**: same multiplication
- **`SelectionEngine._doMove()`**: drag position uses `DS.zoom`
- **`SectionResizeEngine` RAF**: section/canvas height uses `DS.zoom`
- **CSS `#canvas-layer`**: removed stale `transform: none !important`
- **`#ruler-v`**: width `16px` → `22px`; `GUTTER_W 10→14`, `RULER_W 6→8`
- **Font**: `9px Segoe UI,Tahoma,sans-serif`; contrast `#000`/`#222`

---

## v18.7 (2026-03-16) — ZoomEngine Layout Refactor

- Removed ALL `transform:scale()` from `DesignZoomEngine` and `PreviewZoomEngine`
- Zoom now via physical DOM sizing: `vp.style.width = PAGE_W * z + 'px'`
- Sections: `secDiv.style.height = sec.height * z + 'px'`
- Scroll anchor preserved via ratio-based scroll compensation

---

## v18.1 (2026-03-16)

### Bug fixes — Ruler & Layout

- **section-gutter overlap fix:** QA shim created `#section-gutter` with `left:0; width:24px`,
  exactly overlapping `#ruler-v`. Changed to `left:24px; width:0` — ruler now unblocked.
- **ruler color:** H-ruler and V-ruler base fill changed from `#D4D0C8` (beige, indistinguishable
  from UI background) to `#FFFFFF` (white). Tick strokes `#716F64` → `#555555`.
- **split gutter/ruler column:** `renderVRuler()` now splits the 24px column:
  left 16px = section bands + labels (EI/EP/D/PP/RI), right 8px = metric tick marks.
- **design mode canvas alignment:** `#workspace { text-align: left }` — canvas is now flush
  to the vertical ruler (gap ≈ 0px), matching Crystal Reports design mode layout.
- **preview mode canvas centering:** `body[data-render-mode="preview"] #workspace { text-align: center }`
  — preview canvas remains centered, matching Crystal Reports preview mode layout.
- **PreviewZoomEngine:** `transformOrigin: 'top left'` (was `'top center'`) — zoom anchors
  at ruler edge, not screen center.
- **double zoom removed:** `DesignZoomEngine.set(DS.zoomPreview)` removed from `PreviewEngine.show()`;
  `PreviewZoomEngine` is now the sole zoom engine in preview mode.
- **canvas centering removed:** `#canvas-layer { margin-inline-end: 0 }` (was `auto`).

# Changelog

## v18.0 (2026-03-15) — Four-Layer Architecture Implementation

### Architecture (Phases 1-7)

**Phase 1 — Centralized Layout Engine**
- `computeLayout()` function returns `{rulerWidth, rulerHeight, canvasX, canvasY, workspaceLeft, workspaceTop}`
- Formula: `canvasX = CFG.RULER_W + DS.pageMarginLeft`, `canvasY = CFG.RULER_H + DS.pageMarginTop`
- `window.LayoutEngine = { computeLayout }` exposed for QA and external access
- `CFG.RULER_W = 24`, `CFG.RULER_H = 16`, `CFG.PAGE_MARGIN_LEFT/TOP = 0`

**Phase 2 — Canvas Position**
- `applyLayout()` sets `--layout-canvas-left` / `--layout-canvas-top` CSS vars on `#canvas-layer`
- `DS.pageMarginLeft` / `DS.pageMarginTop` fields added to DocumentStore
- `set-margin-left/top` commands call `applyLayout()` after updating DS
- Canvas CSS uses `margin-inline-start: var(--layout-canvas-left, 0px)` instead of `auto`

**Phase 3 — Command System (100%)**
- `insert-section` wired in dispatch switch + CMD_REGISTRY
- `set-margin-left/top` update DS and call `applyLayout()`
- Command matrix: **84/84 (100%)** — all categories complete

**Phase 4 — Full Section System**
- `sec.visible` field added to all 5 default sections
- `CommandEngine.insertSection()` — inserts new Detail section
- `CommandEngine.toggleSectionVisibility()` — toggle visibility
- `SectionEngine.render()` honors `sec.visible === false` → `display:none`

**Phase 5 — Layer Ordering** ✅ (already implemented)
- `CommandEngine.bringForward()` / `sendBackward()` — zIndex ±1

**Phase 6 — Advanced Zoom**
- `zoomFitPage()` / `zoomFitWidth()` use `computeLayout()` for ruler-aware calculation
- Formula: `availW = ws.clientWidth - lay.rulerWidth - 32`

**Phase 7 — Geometry Stabilization** ✅
- `DS.snap()` always returns integer (`Math.round(v/CFG.GRID)*CFG.GRID`)
- `DS.pageMarginLeft/Top` integrated into layout formula

### QA (Phases 8-10)

**Phase 9 — Layout Invariant Engine**
- `repo-layout-invariants.sh`: **46/46 tests** (up from 43)
- New invariants: `computeLayout formula`, `--layout-canvas-left CSS var`
- 6 scenarios: baseline, zoom×2, zoom×0.5, selection, preview, 30-op stress

**Phase 10 — Pipeline**
- `repo-super.sh`: adaptive timeouts (layout/invariants/god=180s)
- `repo-layout.sh` rewritten using `_rf_test_lib.js` → 7s (was 90s)
- All 33 scripts pass

### Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| god-level-qa.js | 955 | ✅ 955/955 |
| repo-layout-invariants.sh | 46 | ✅ 46/46 |
| repo-designer-god.sh | 60 | ✅ 60/60 |
| repo-command-matrix.sh | 84 | ✅ 84/84 (100%) |
| repo-ui-state.sh | 12 | ✅ 12/12 |
| repo-layout.sh | 14 | ✅ 14/14 |

---

## v17.5 (2026-03-15)
- 21 new QA scripts (Phases 33/34): geometry, floating-point, determinism, undo-integrity, layout-invariants, multi-object, memory, crash-guard, state-machine, serialization, latency, performance-budget, visual-diff, input-devices, replay, layout-reflow, layout-stress, command-idempotency, extension-safety, idempotency
- `repo-layout-invariants.sh`: 12 invariants validated across 6 scenarios (43 tests)
- `repo-super.sh`: 7 groups, 33 scripts

## v17.0 (2026-03-15)
- 23 missing commands implemented: group, ungroup, invertSelection, zoomFitPage, zoomFitWidth, addHGuide, addVGuide, bringForward, sendBackward, deleteSection, moveSectionUp/Down, renameSection, lock/unlock/hide/showObject, margins
- Command matrix: 84/84 (100%)
- `repo-command-matrix.sh`: grouped output + `repo-missing-commands.json`

## v16.5 (2026-03-15)
- `repo-command-matrix.sh`: Phase 32 Expected Command Matrix (84 commands, 18 categories)
- `repo-ui-map.json` export

## v16.1–v16.0 (2026-03-15)
- `repo-ui-enhanced.sh`, `repo-ui-explorer.sh`, `repo-ui-state.sh`
- `repo-super.sh` orchestrator

## v15.2 (2026-03-15)
- Fix: `renderVRuler()` canvas height covers full workspace (774px ≥ 710px)

## v15.1 (2026-03-15)
- Independent zoom modes, wheel ~10%, L-shaped handles, preview guides
