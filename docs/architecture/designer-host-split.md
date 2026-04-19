# Designer Host Split

## Estado actual

`crystal-reports-designer-v4.html` es un host fino (≤ 30 KB). La separación está completa:

| Capa | Dónde vive | Estado |
|---|---|---|
| DOM base | `designer/crystal-reports-designer-v4.html` | limpio |
| CSS | `designer/styles/` (14 archivos, @layer) | limpio |
| Config / constantes | `engines/RuntimeGlobals.js` | limpio |
| Estado canónico | `engines/DocumentStore.js` (DS) | limpio |
| Doc types + field trees + sample data | `engines/DocTypeAndProbes.js` | limpio |
| Fórmulas + debug | `engines/FormulaAndDebug.js` | limpio |
| Globals de geometría | `engines/RuntimeGlobals.js` | limpio |
| Engines de render/interacción | `engines/*.js` (40 archivos) | limpio |
| Boot principal | `engines/RuntimeBootstrap.js` | limpio |
| Boot diferido + bridges activos | `engines/DeferredBootstrap.js` | puentes activos (ver backlog) |
| Command dispatcher | `engines/CommandRuntime.js` | limpio |

## Ownership por subsistema

| Subsistema | Owner canónico | Fuente de verdad | Writers activos | Riesgo legacy |
|---|---|---|---|---|
| Estado del documento | `DocumentStore.js` (DS) | `DS.sections`, `DS.elements` | DS API | bajo |
| Selección | `SelectionEngine.js` | `DS.selection` | `SelectionEngine.renderHandles()` | medio — ver RF-ARCH-002 |
| Canvas / layout | `CanvasLayoutEngine.js` | `DS.sections`, `DS.elements`, DOM `.cr-section/.cr-element` | `CanvasLayoutEngine` | medio — ver RF-ARCH-004 |
| Zoom | `ZoomEngine.js` (`ZoomEngineV19`) | `DS.zoom` | `DesignZoomEngine._apply` (en DeferredBootstrap) | alto — ver RF-ARCH-008 |
| History | `HistoryEngine.js` + `DS.saveHistory` | `DS.history` | ambos — ver RF-ARCH-006 | alto |
| Preview | `PreviewEngine.js` | `DS.previewMode` | `PreviewEngine.show/hide` | bajo |
| Scheduler | `RenderScheduler.js` | colas internas | scheduler + writes directos residuales | medio — ver RF-ARCH-005 |
| Geometría | `RF.Geometry` (RuntimeGlobals) | BoundingRect + viewport | `RF.Geometry.*` | bajo |
| Formula | `FormulaAndDebug.js` | - | `FormulaEngine` | bajo |
| Doc types | `DocTypeAndProbes.js` | `DOC_TYPES` | global write única | bajo |
| Boot | `RuntimeBootstrap.js` + `DeferredBootstrap.js` | secuencia DOMContentLoaded | dos fases explícitas | bajo |
| Commands | `CommandRuntime.js` | - | `handleAction` | bajo |
| Keyboard | `KeyboardEngine.js` | - | `KeyboardEngine.init()` | bajo |
| Menus | `MenuAdapters.js` | - | `initMenuBindings()` | bajo |

## DOM contract canónico

IDs públicos requeridos por engines y tests. Si desaparecen, el runtime falla.

### Canvas

| ID | Rol |
|---|---|
| `canvas-layer` | contenedor raíz del canvas escalado |
| `viewport` | capa de transformación de zoom |
| `workspace` | scroll container |
| `sections-layer` | secciones DOM renderizadas |
| `elements-layer` | elementos DOM (`.cr-element`) |
| `handles-layer` | handles de selección |
| `selection-layer` | overlay de selección |
| `guides-layer` | guides internos |
| `guide-layer` | guide-overlay fuera del viewport (workspace-space) |
| `snap-layer` | snap visual |
| `labels-layer` | labels de sección |
| `rubber-band` | rectángulo de selección múltiple |
| `insert-ghost` | fantasma de inserción |
| `field-drop-indicator` | indicador drop de campo |
| `preview-layer` | capa de preview |
| `preview-content` | contenido de preview |

### Paneles

| ID | Rol |
|---|---|
| `field-explorer` | explorador de campos (panel derecho) |
| `field-tree` | árbol de campos |
| `properties-panel` | panel de propiedades |
| `props-body` | cuerpo del panel |
| `props-form` | formulario de propiedades |
| `sections-list` | lista de secciones (panel izquierdo) |

### Chrome

| ID | Rol |
|---|---|
| `menubar` | barra de menús |
| `statusbar` | barra de estado |
| `sb-msg` | mensaje de estado |
| `sb-zoom` | indicador de zoom |
| `sb-pos` | posición cursor |
| `tabs-row` | fila de pestañas |
| `tab-design` | pestaña Diseño |
| `tab-preview` | pestaña Preview |
| `doc-type-bar` | selector de tipo de documento |
| `zw-slider` | slider de zoom |
| `ctx-menu` | menú contextual |

### Overlays / helpers

| ID | Rol |
|---|---|
| `ruler-h-inner` | canvas regla horizontal |
| `ruler-v-inner` | canvas regla vertical |
| `grid-overlay` | overlay de cuadrícula |
| `resize-badge` | badge de resize de sección |
| `field-drag-ghost` | fantasma de drag de campo |

## Deuda activa

Ver `docs/architecture/transformation-backlog.md`:

- RF-ARCH-002: Selección — bridge ambiguo pendiente
- RF-ARCH-006: Historia dual (DS + HistoryEngine)
- RF-ARCH-008: Zoom dual (DesignZoomEngine._apply en DeferredBootstrap)
- RF-ARCH-011: DOM contract — este documento lo define

## Bridges activos

Los bridges zoom y history viven en `engines/DeferredBootstrap.js`, no en el HTML host. El HTML no contiene ningún bridge ni patch. Ver `docs/architecture/bridges-and-shims.md`.
