# Duplicate Writers Inventory

## Duplicate Writers

| Dominio | Writer A | Writer B | Archivo / línea | Síntoma | Severidad | Owner único propuesto |
|---|---|---|---|---|---|---|
| Canvas element DOM | legacy monolith canvas writer | `CanvasLayoutEngine.renderAll/buildElementDiv` | monolith / [engines/CanvasLayoutEngine.js](/home/mimi/Escritorio/RF/engines/CanvasLayoutEngine.js#L88) | dos implementaciones para `.cr-element` | crítica | `CanvasLayoutEngine` |
| Selection overlay DOM | `SelectionOverlay.renderHandles` | `SelectionOverlay.js` | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L3581) / [engines/SelectionOverlay.js](/home/mimi/Escritorio/RF/engines/SelectionOverlay.js#L1) | overlay y handles con ownership ambiguo | crítica | `SelectionOverlay.js` |
| Selection classes | `SelectionOverlay.renderHandles()` toggles `.selected` | modular `core/selection.js` toggles `.selected` on alternate DOM contract | [engines/SelectionOverlay.js](/home/mimi/Escritorio/RF/engines/SelectionOverlay.js#L1) / [reportforge/designer/js/core/selection.js](/home/mimi/Escritorio/RF/reportforge/designer/js/core/selection.js#L62) | dos contratos de selección visual | alta | runtime canónico only |
| Zoom application | `DesignZoomEngine._apply` | `ZoomEngineV19.set/setFree` | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7610) / [engines/ZoomEngine.js](/home/mimi/Escritorio/RF/engines/ZoomEngine.js#L46) | zoom con wrappers sucesivos | crítica | `ZoomEngineV19` or one canonical zoom engine |
| History snapshots | `DS.saveHistory/undo/redo` | `HistoryEngine.push/undo/redo` | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L3116) / [engines/HistoryEngine.js](/home/mimi/Escritorio/RF/engines/HistoryEngine.js#L70) | doble stack y doble restore | crítica | one history engine |
| Preview rendering | monolithic preview helpers | `PreviewEngineV19` | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7018) / [engines/PreviewEngine.js](/home/mimi/Escritorio/RF/engines/PreviewEngine.js#L41) | preview con dos caminos de render | alta | `PreviewEngineV19` |
| Element positioning | `SelectionInteraction._doMove/_doResize` | `ElementLayoutEngine` writes same fields | [engines/SelectionInteraction.js](/home/mimi/Escritorio/RF/engines/SelectionInteraction.js#L1) / [engines/ElementLayoutEngine.js](/home/mimi/Escritorio/RF/engines/ElementLayoutEngine.js#L35) | corrección sucesiva de layout | alta | layout pipeline only |
| Canvas sizing | monolithic sync hooks call `CanvasLayoutEngine.updateSync()` | `CanvasLayoutEngine` schedules itself | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7563) / [engines/CanvasLayoutEngine.js](/home/mimi/Escritorio/RF/engines/CanvasLayoutEngine.js#L76) | bypass al scheduler | alta | scheduler-driven `CanvasLayoutEngine` |
| Handle rendering | `HandlesEngine.render()` | `SelectionOverlay.renderHandles()` | [engines/HandlesEngine.js](/home/mimi/Escritorio/RF/engines/HandlesEngine.js#L73) / [engines/SelectionOverlay.js](/home/mimi/Escritorio/RF/engines/SelectionOverlay.js#L1) | owner declarativo vs owner real | media | `SelectionOverlay.js` with explicit contract |
| DOM contract aliasing | `.cr-element` | alias DOM injected by monolith | runtime boot | DOM tests depend on both names | alta | one element contract |
| Inline presentation | monolith inline HTML/CSS strings | engines `style.cssText` / `style.*` | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7019) / [engines/SelectionEngine.js](/home/mimi/Escritorio/RF/engines/SelectionEngine.js#L165) | style ownership spread | alta | CSS contract + minimal geometry inline |

## Severity Rule

- `crítica`: multiple active writers can break runtime behavior.
- `alta`: duplicated writer paths already complicate debugging and regressions.
- `media`: duplicate ownership is indirect but still architectural debt.
