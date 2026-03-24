# Layers

## Shell HTML

Archivo:

- [`designer/crystal-reports-designer-v4.html`](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html)

Responsabilidad:

- host del documento
- mounting points
- carga de CSS y scripts

Puede usar:

- markup declarativo
- `<link rel="stylesheet">`
- `<script src>`

No puede usar:

- JS inline
- CSS inline
- event handlers inline
- engines/helpers inline
- bootstrap inline

## Store

Archivo:

- [`engines/DocumentStore.js`](/home/mimi/Escritorio/RF/engines/DocumentStore.js)

Responsabilidad:

- estado canónico `DS`
- acciones del store
- selectors
- invariants básicos

Puede usar:

- estado serializable
- helpers de modelo

No puede usar:

- wiring DOM
- toolbar/menu bindings
- lógica de presentación

## Engines

Archivos ejemplo:

- [`engines/SelectionEngine.js`](/home/mimi/Escritorio/RF/engines/SelectionEngine.js)
- [`engines/CanvasLayoutEngine.js`](/home/mimi/Escritorio/RF/engines/CanvasLayoutEngine.js)
- [`engines/PreviewEngine.js`](/home/mimi/Escritorio/RF/engines/PreviewEngine.js)
- [`engines/SectionEngine.js`](/home/mimi/Escritorio/RF/engines/SectionEngine.js)
- [`engines/ZoomEngine.js`](/home/mimi/Escritorio/RF/engines/ZoomEngine.js)

Responsabilidad:

- lógica de dominio
- ownership de subsistemas
- writes de DOM solo dentro de su scope y bajo scheduler cuando aplica

Puede usar:

- `DS`
- `RenderScheduler`
- `RuntimeServices`
- otros engines según contratos del runtime

No puede usar:

- wiring UI general
- toolbar/menu bindings
- estado paralelo canónico

## CommandRuntime

Archivo:

- [`engines/CommandRuntime.js`](/home/mimi/Escritorio/RF/engines/CommandRuntime.js)

Responsabilidad:

- entrypoint lógico de commands
- orquestación de acciones
- traducción command -> mutación `DS` / engine owner

Puede usar:

- `DS`
- engines canónicos
- helpers de layout/preview ya aprobados

No puede usar:

- registrar listeners DOM
- absorber wiring UI

## UI Adapters

Archivos:

- [`engines/UIAdapters.js`](/home/mimi/Escritorio/RF/engines/UIAdapters.js)
- [`engines/MenuAdapters.js`](/home/mimi/Escritorio/RF/engines/MenuAdapters.js)
- [`engines/GlobalEventHandlers.js`](/home/mimi/Escritorio/RF/engines/GlobalEventHandlers.js)

Responsabilidad:

- traducir eventos DOM a commands/actions/engines
- manejar estado visual local de menús y bindings

Puede usar:

- funciones públicas de `CommandRuntime`
- engines canónicos de interacción

No puede usar:

- `DS` directo en adapters UI generales
- `saveHistory`
- `_canonicalCanvasWriter`
- lógica de negocio compleja

Nota:

- `GlobalEventHandlers` es un adapter root de input; puede leer estado de runtime como `DS.previewMode`, pero no debe convertirse en engine de dominio.

## Bootstrap

Archivos:

- [`engines/RuntimeBootstrap.js`](/home/mimi/Escritorio/RF/engines/RuntimeBootstrap.js)
- [`engines/DeferredBootstrap.js`](/home/mimi/Escritorio/RF/engines/DeferredBootstrap.js)

Responsabilidad:

- secuencia de arranque
- registro de adapters y servicios
- wiring de inicio permitido

Puede usar:

- inicialización
- registro de refs/owners/flags en `RuntimeServices`

No puede usar:

- lógica de negocio de commands
- wiring toolbar/menu inline
- mutaciones arbitrarias de `DS` fuera de init mínimo

## RuntimeServices

Archivo:

- [`engines/RuntimeServices.js`](/home/mimi/Escritorio/RF/engines/RuntimeServices.js)

Responsabilidad:

- owners canónicos
- flags de runtime
- refs DOM estructurales
- contract guards
- metadatos compartidos

No puede usar:

- lógica de negocio del diseñador
- render
- UI wiring
