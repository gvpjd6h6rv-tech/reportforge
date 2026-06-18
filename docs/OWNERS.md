# Engine Ownership Map

> Regla: ningún owner calcula ni muta responsabilidad de otro.
> Cada archivo pertenece a exactamente un owner.
> Las violaciones documentadas aquí son deuda técnica con plan de resolución.

## Owners

### 1. Geometry
Responsabilidad: coordenadas, zoom, transformaciones, snap, escalas.

| Archivo | LOC | Notas |
|---------|-----|-------|
| GeometryCore.js | — | Transforms, scale, viewToModel/modelToView |
| CanvasGeometry.js | — | Element view rects, section positioning |
| RuntimeGeometry.js | — | RF.Geometry install/invalidate |
| RuntimeGlobals.js | 449 | RF namespace, Geometry facade |
| HitTestGeometry.js | — | Geometry helpers for hit testing |
| AlignmentGeometry.js | — | Alignment/snap geometry math |
| SnapCore.js | — | Snap grid calculations |

**Violaciones**: ninguna detectada. Owner limpio.

---

### 2. Routing
Responsabilidad: normalizar pointer events, despachar a engines, routing de fases down/move/up.

| Archivo | LOC | Notas |
|---------|-----|-------|
| EngineCoreRoutingPointer.js | 240 | routePointer factory, preview/design dispatch |
| EngineCoreRouting.js | — | Routing orchestrator |
| EngineCoreRoutingRegistry.js | — | Engine registry |
| EngineCoreRoutingWorkspace.js | — | Workspace event wiring |
| EngineCoreRoutingZoom.js | — | Zoom routing |
| EngineCore.js | 235 | Core engine bootstrap |
| EngineCoreContracts.js | 442 | Runtime contract assertions |
| EngineCoreRuntime.js | 319 | Runtime init |

**Violaciones**:
- `EngineCoreRoutingPointer.js:69` — lee `DS.selection` directamente (debería usar SelectionState)
- `EngineCoreContracts.js:375-389` — lee `DS.selection` directamente en assertions

---

### 3. HitTest
Responsabilidad: determinar qué elemento/handle/section está bajo un punto.

| Archivo | LOC | Notas |
|---------|-----|-------|
| HitTestEngine.js | — | elementAt, sectionAt, handleAt (model-based) |
| SelectionHitTest.js | — | resolveElementDiv, resolvePointerId, resolveRenderSelectionIds |

**Violaciones**:
- `SelectionHitTest.js:5` — lee `DS.previewMode` para elegir selector DOM (soft, aceptable como view-mode switch)

---

### 4. Selection State
Responsabilidad: qué elementos están seleccionados, add/remove/clear, getElementById.

| Archivo | LOC | Notas |
|---------|-----|-------|
| SelectionState.js | — | selectedIds, addSelection, clearSelectionState, snap |
| SelectionEngineContracts.js | — | Contract assertions para selection |
| SelectionEngine.js | — | Facade que delega a Interaction/Overlay |

**Violaciones**: ninguna detectada. Owner limpio.

---

### 5. Selection Interaction
Responsabilidad: capturar pointer down, crear engine._drag, ejecutar move/resize/rubber.

| Archivo | LOC | Notas |
|---------|-----|-------|
| SelectionInteraction.js | — | Thin orchestrator |
| SelectionInteractionPointer.js | — | onElementPointerDown, onHandlePointerDown, attachEvents |
| SelectionInteractionMotion.js | — | _doMove, _doResize, _doRubberBand, onMouseUp |

**Violaciones**:
- `SelectionInteractionMotion.js:67,111` — lee `DS.previewMode` para sync pv-el DOM (soft)

**Resuelto en FASE 4-2**:
- `SelectionInteractionPointer.js` ya no llama `PreviewEngineMode.enableSelectionOverlay()` directamente; delega el bridge a `SelectionEngine.enableSelectionOverlay()`.

**Resuelto en FASE 4-1**:
- `SelectionInteractionMotion.js` ya no llama `DS.updateElementLayout()` directamente; delega la mutación de layout a `SelectionEngine.updateElementLayout()`.

---

### 6. Selection Overlay
Responsabilidad: renderizar sel-box, handles, guides, limpiar layers.

| Archivo | LOC | Notas |
|---------|-----|-------|
| SelectionOverlay.js | — | renderHandles, clearSelection, updateSelectionInfo |
| SelectionOverlayPreview.js | — | Preview layer, previewRect, renderSelectionGuides |
| SelectionGeometry.js | — | selectionHandles positions, rubberBandRect, bounds |

**Violaciones**:
- `SelectionOverlay.js:19,35,88,108` — **HARD**: llama `SelectionOverlayPreview.*` directamente (aceptable: mismo subsistema overlay)

**Resuelto en FASE 4-3**:
- `SelectionOverlay.js` ya no llama `PreviewEngineMode.isSelectionOverlayVisible/enableSelectionOverlay/resetSelectionOverlay` directamente; delega esos checks/acciones a `SelectionEngine` como bridge.

---

### 7. Preview
Responsabilidad: modo preview, renderizado HTML, hit-layer, zoom preview.

| Archivo | LOC | Notas |
|---------|-----|-------|
| PreviewEngine.js | — | Facade (show/hide/toggle) |
| PreviewEngineMode.js | — | State: active, selectionVisible |
| PreviewEngineRenderer.js | — | refresh, clear, page navigation |
| PreviewEngineRendererLayout.js | — | Layout: page width/height, hit-layer alignment |
| PreviewEngineData.js | 219 | renderWithData, renderInstanceElement |
| PreviewEngineContracts.js | — | Contract assertions |
| PreviewPaginationEngine.js | — | Page navigation |

**Violaciones**: ninguna detectada. Owner limpio.

**Resuelto en FASE 4-4**:
- `PreviewEngineRenderer.js` ya no llama `SelectionEngine.renderHandles()` directamente; publica `rf-preview-rendered` y `SelectionEngine` responde al evento.

---

### 8. Canvas Layout
Responsabilidad: crear/actualizar DOM de elementos en design canvas, secciones, tamaños.

| Archivo | LOC | Notas |
|---------|-----|-------|
| CanvasLayoutEngine.js | — | Canvas render orchestrator |
| CanvasLayoutElements.js | 225 | buildElementDiv, updateElement, updateElementPosition |
| CanvasLayoutSize.js | — | Canvas/stage sizing |
| CanvasLayoutContracts.js | — | Layout contract assertions |
| ElementLayoutEngine.js | — | Element position/size layout |
| SectionLayoutEngine.js | — | Section layout |

**Violaciones**: ninguna detectada. Owner limpio.

---

### 9. Scheduler
Responsabilidad: batching de DOM writes, flush sync, observability.

| Archivo | LOC | Notas |
|---------|-----|-------|
| RenderScheduler.js | — | Public API |
| RenderSchedulerFrame.js | 238 | Frame-level flush |
| RenderSchedulerQueue.js | — | Queue management |
| RenderSchedulerScope.js | — | Write scope tracking |
| RenderSchedulerState.js | — | Internal state |
| RenderSchedulerObservability.js | — | Metrics/traces |

**Violaciones**: ninguna detectada. Owner limpio.

---

## Resumen de Violaciones Cross-Owner

| Desde | Hacia | Archivo:línea | Tipo | Severidad |
|-------|-------|---------------|------|-----------|
| Routing | Selection State | RoutingPointer.js:69 | lee DS.selection | SOFT |
| Routing | Selection State | Contracts.js:375-389 | lee DS.selection | SOFT |
| HitTest | Preview | SelectionHitTest.js:5 | lee DS.previewMode | SOFT |
| Sel. Overlay | Preview | Overlay.js:71,73,157 | llama PreviewEngineMode | **HARD** |
| Preview | Selection | Renderer.js:72 | resuelto en FASE 4-4 mediante evento `rf-preview-rendered` | RESUELTO |

### Violaciones HARD: 0 pares cross-owner (0 call sites)
### Violaciones SOFT: 3 pares (DS.previewMode reads, DS.selection reads)

---

## Plan de Resolución (FASE 4)

1. **Sel. Interaction → Canvas Layout**: resuelto en FASE 4-1 mediante `SelectionEngine.updateElementLayout()`
2. **Sel. Interaction → Preview**: resuelto en FASE 4-2 mediante `SelectionEngine.enableSelectionOverlay()`
3. **Sel. Overlay → Preview**: resuelto en FASE 4-3 mediante `SelectionEngine.isSelectionOverlayVisible()/enableSelectionOverlay()/resetSelectionOverlay()`
4. **Preview → Selection**: resuelto en FASE 4-4 mediante evento `rf-preview-rendered`

> FASE 4-3 cerrada: `Sel. Overlay → Preview`.

> FASE 4-2 cerrada: `Sel. Interaction → Preview`.

> FASE 4-1 cerrada: `Sel. Interaction → Canvas Layout`.

> FASE 4-4 cerrada: `Preview → Selection`.
