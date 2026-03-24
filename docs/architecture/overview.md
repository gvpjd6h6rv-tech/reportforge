# Architecture Overview

## Estado Actual

El sistema vivo ya no es un monolito inline.

El runtime canónico es:

- shell: [`designer/crystal-reports-designer-v4.html`](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html)
- lógica: [`engines/*.js`](/home/mimi/Escritorio/RF/engines)

La arquitectura actual persigue cuatro objetivos:

1. `DS` como única fuente de verdad del path crítico
2. owners y writers únicos por subsistema
3. boundaries fuertes entre shell, bootstrap, adapters, commands y engines
4. guardrails de CI para impedir recaídas

## Mapa de Capas

```text
Shell HTML
  -> RuntimeBootstrap / DeferredBootstrap
    -> RuntimeServices
    -> UIAdapters / MenuAdapters / GlobalEventHandlers
      -> CommandRuntime
        -> Engines
          -> DocumentStore (DS)
          -> RenderScheduler
            -> DOM
```

## Núcleo Canónico

Store:

- [`engines/DocumentStore.js`](/home/mimi/Escritorio/RF/engines/DocumentStore.js)

Orquestación:

- [`engines/CommandRuntime.js`](/home/mimi/Escritorio/RF/engines/CommandRuntime.js)
- [`engines/EngineCore.js`](/home/mimi/Escritorio/RF/engines/EngineCore.js)
- [`engines/RenderScheduler.js`](/home/mimi/Escritorio/RF/engines/RenderScheduler.js)

Adapters:

- [`engines/UIAdapters.js`](/home/mimi/Escritorio/RF/engines/UIAdapters.js)
- [`engines/MenuAdapters.js`](/home/mimi/Escritorio/RF/engines/MenuAdapters.js)
- [`engines/GlobalEventHandlers.js`](/home/mimi/Escritorio/RF/engines/GlobalEventHandlers.js)

Services:

- [`engines/RuntimeServices.js`](/home/mimi/Escritorio/RF/engines/RuntimeServices.js)

Engines principales:

- [`engines/SelectionEngine.js`](/home/mimi/Escritorio/RF/engines/SelectionEngine.js)
- [`engines/CanvasLayoutEngine.js`](/home/mimi/Escritorio/RF/engines/CanvasLayoutEngine.js)
- [`engines/PreviewEngine.js`](/home/mimi/Escritorio/RF/engines/PreviewEngine.js)
- [`engines/SectionEngine.js`](/home/mimi/Escritorio/RF/engines/SectionEngine.js)
- [`engines/SectionResizeEngine.js`](/home/mimi/Escritorio/RF/engines/SectionResizeEngine.js)
- [`engines/ZoomEngine.js`](/home/mimi/Escritorio/RF/engines/ZoomEngine.js)
- [`engines/PropertiesEngine.js`](/home/mimi/Escritorio/RF/engines/PropertiesEngine.js)
- [`engines/FormatEngine.js`](/home/mimi/Escritorio/RF/engines/FormatEngine.js)
- [`engines/FieldExplorerEngine.js`](/home/mimi/Escritorio/RF/engines/FieldExplorerEngine.js)

## Reglas de Arquitectura

- El HTML no contiene JS inline ni CSS inline.
- `DS` vive fuera del HTML.
- `CommandRuntime` centraliza commands.
- `UIAdapters` traduce DOM -> commands/actions.
- `RuntimeServices` centraliza owners, flags, refs y guards estructurales.
- Los writes del path crítico pasan por scheduler.
- `Preview` comparte el mismo core de interacción con `Design`.

## Qué Está Prohibido

- reintroducir engines en el HTML
- reintroducir wiring inline
- exportar nuevos engines a `window.*`
- leer estado desde DOM como truth
- meter lógica de negocio en bootstrap
- tocar `DS` desde adapters UI generales

## Validación

El runtime canónico se considera sano solo si pasan:

```bash
npm run test:contracts
npm run test:governance
npm run test:runtime
```
