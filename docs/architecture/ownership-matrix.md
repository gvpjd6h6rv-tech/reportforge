# Ownership Matrix

## Real Ownership Today

| Subsystem | Owner Real Actual | Writers Actuales | Readers Relevantes | Bridges / Shims | Source of Truth Actual | Estado |
|---|---|---|---|---|---|---|
| Canvas / layout | Híbrido entre monolito y `CanvasLayoutEngine` | `CanvasEngine` monolítico, `CanvasLayoutEngine`, `SectionLayoutEngine`, `ElementLayoutEngine` | `SelectionEngine`, `RulerEngine`, `WorkspaceScrollEngine`, preview | `CanvasEngine patched -> CanvasLayoutEngine` | `DS.sections`, `DS.elements`, DOM `.cr-section/.cr-element` | roto |
| Selection | `SelectionEngine` facade over split owners | `GeometryCore`, `CanvasGeometry`, `SelectionState`, `SelectionHitTest`, `SelectionGeometry`, `SelectionOverlay`, `SelectionInteraction` | resize, status bar, preview highlight, properties | `SelectionEngine facade -> split selection owners` | `DS.selection` + overlay DOM + interaction state | en transición |
| Resize / handles | `SelectionOverlay.js` + `SelectionInteraction.js` | `SelectionOverlay.renderHandles()`, drag/resize loop | `HandlesEngine`, overlay CSS, user interaction | `HandlesEngine.render -> SelectionOverlay.renderHandles()` | `_drag` + `DS.elements` + `#handles-layer` | híbrido |
| Zoom | Híbrido entre `DesignZoomEngine` y `ZoomEngineV19` | `DesignZoomEngine._apply`, `ZoomEngineV19`, UI widgets | `RF.Geometry`, rulers, grid, preview, workspace scroll | multiple `_apply` patches | `DS.zoom` + geometry reads + UI labels | roto |
| Preview | `PreviewEngineV19` puenteado sobre `PreviewEngine` | `PreviewEngineV19.show/hide/refresh`, monolithic preview helpers still exist | tabs, zoom widget, selection preview sync | `PreviewEngine patched -> PreviewEngineV19` | `DS.previewMode`, `DS.zoomPreview`, preview DOM | híbrido |
| History | Híbrido `DS.history` + `HistoryEngine` | `DS.saveHistory/undo/redo`, `HistoryEngine.push/undo/redo` | actions, keyboard, menus | `DS.saveHistory` patched to “stay in sync” | `DS.history` plus private engine stacks | roto |
| Geometry | `RF.Geometry` nominally + domain split | `RF.Geometry`, `GeometryCore`, `CanvasGeometry`, `SelectionGeometry`, `HitTestGeometry`, DOMRect reads, geometry fallbacks in engines | almost every subsystem | contract variants still active | `RF.Geometry` + domain geometry + DOM measurement + inline style positions | híbrido |
| Scheduler | `RenderScheduler` nominally | `RenderScheduler.*`, but direct `updateSync` and direct writes still occur | all engines | direct sync hooks from monolith | scheduler queues + direct side effects | híbrido |
| Formula / debug | `FormulaEngine` + split debug owners | `FormulaEngine`, `FormulaEditorDialog`, `DesignerUI`, `DebugTrace`, `DebugChannelsPanel`, `DebugTraceToggle`, `DebugOverlay` | formula editor, runtime boot, trace-enabled engines | `FormulaAndDebug.js` facade only | formula runtime + debug state + overlay DOM | limpio |
| Server entrypoint | `reportforge_server.py` | HTTP routing | `run.sh`, browser, tests | v4/v3 fallback | server routing table | limpio |

## Notes

- The runtime claims strict v19 ownership, but actual ownership is still shared by patches and wrappers.
- Selection, zoom, history and layout are the least clean subsystems.
- The modular runtime has its own ownership model and is not the real owner of production runtime behavior today.
