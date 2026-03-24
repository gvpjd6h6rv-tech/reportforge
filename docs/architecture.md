# ReportForge Architecture

## Visión General

El frontend vivo de ReportForge es un runtime clásico en navegador con un host HTML mínimo y módulos externos cargados por `script src`.

Estado actual:

- [`designer/crystal-reports-designer-v4.html`](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html) es shell puro
- el estado canónico vive en [`engines/DocumentStore.js`](/home/mimi/Escritorio/RF/engines/DocumentStore.js)
- la interacción se coordina desde [`engines/EngineCore.js`](/home/mimi/Escritorio/RF/engines/EngineCore.js) y [`engines/RenderScheduler.js`](/home/mimi/Escritorio/RF/engines/RenderScheduler.js)
- las dependencias estructurales compartidas viven en [`engines/RuntimeServices.js`](/home/mimi/Escritorio/RF/engines/RuntimeServices.js)
- `governance`, `contracts` y `runtime` bloquean regresiones arquitectónicas

Problemas que resuelve esta arquitectura:

- elimina lógica de negocio inline en el HTML
- evita doble ownership y writers duplicados
- centraliza flags, owners y refs estructurales
- mantiene `DS` como única fuente de verdad del path crítico
- fuerza rutas de render gobernadas por scheduler

Lo que no está permitido reintroducir:

- JS o CSS inline en el shell
- engines inline en el HTML
- wiring UI inline en el HTML
- bridges/fallbacks silenciosos
- estado paralelo fuera de `DS`
- nuevos globals `window.*` fuera de whitelist
- adapters tocando `DS` directo
- bootstrap con lógica de negocio

## Principios Normativos

- `DS` es la SSOT para selección, zoom y layout base.
- El DOM es representación, no fuente de verdad.
- Cada subsistema tiene un owner y writer únicos.
- Los writes de DOM críticos pasan por `RenderScheduler`.
- `RuntimeServices` reemplaza globals estructurales crudos.
- El shell HTML solo hospeda markup, CSS y scripts externos.
- Las reglas se validan por tests, no por disciplina manual.

## Mapa Operativo

- Shell: [`designer/crystal-reports-designer-v4.html`](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html)
- Store: [`engines/DocumentStore.js`](/home/mimi/Escritorio/RF/engines/DocumentStore.js)
- Bootstrap: [`engines/RuntimeBootstrap.js`](/home/mimi/Escritorio/RF/engines/RuntimeBootstrap.js), [`engines/DeferredBootstrap.js`](/home/mimi/Escritorio/RF/engines/DeferredBootstrap.js)
- Core: [`engines/EngineCore.js`](/home/mimi/Escritorio/RF/engines/EngineCore.js), [`engines/RenderScheduler.js`](/home/mimi/Escritorio/RF/engines/RenderScheduler.js)
- Services: [`engines/RuntimeServices.js`](/home/mimi/Escritorio/RF/engines/RuntimeServices.js)
- Commands: [`engines/CommandRuntime.js`](/home/mimi/Escritorio/RF/engines/CommandRuntime.js)
- UI adapters: [`engines/UIAdapters.js`](/home/mimi/Escritorio/RF/engines/UIAdapters.js), [`engines/MenuAdapters.js`](/home/mimi/Escritorio/RF/engines/MenuAdapters.js), [`engines/GlobalEventHandlers.js`](/home/mimi/Escritorio/RF/engines/GlobalEventHandlers.js)
- Domain engines: `SelectionEngine`, `SectionEngine`, `CanvasLayoutEngine`, `PreviewEngine`, `ZoomEngine`, `PropertiesEngine`, `FormatEngine`, `FieldExplorerEngine`

## Flujos Clave

Toolbar:

`click toolbar -> UIAdapters -> CommandRuntime/format handler -> engine -> DS -> RenderScheduler -> DOM`

Interacción de canvas:

`pointer event -> GlobalEventHandlers / EngineCore router -> SelectionEngine / DragEngine / SectionResizeEngine -> DS -> RenderScheduler -> overlay/canvas`

Preview:

`command/tab -> UIAdapters -> preview owner -> mismo core de selección/zoom/layout -> distinto render/chrome`

## Extensión del Sistema

Agregar un engine nuevo:

1. crear módulo en `engines/`
2. definir ownership claro
3. usar `DS` y `RenderScheduler`
4. registrar desde `EngineCore` solo si corresponde al runtime canónico
5. no exportarlo a `window.*` salvo whitelist aprobada

Agregar UI nueva:

1. markup en el shell
2. wiring en `UIAdapters` o adapter equivalente
3. dispatch a `CommandRuntime` o handler canónico
4. nunca tocar `DS` directo desde adapter

Agregar un command:

1. entrypoint en [`engines/CommandRuntime.js`](/home/mimi/Escritorio/RF/engines/CommandRuntime.js)
2. mutación vía API de `DS`
3. render vía engine owner / scheduler
4. cubrir con runtime o governance si agrega frontera nueva
