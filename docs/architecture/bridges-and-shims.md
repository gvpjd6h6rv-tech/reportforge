# Bridges and Shims

## Active Bridges / Compatibility Layers

| Nombre | Dónde está | Qué conecta | Por qué existe | ¿Sigue siendo necesario hoy? | Riesgo de removerlo | Prioridad |
|---|---|---|---|---|---|---|
| CanvasEngine patch bridge | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7669) | `CanvasEngine` legacy -> `CanvasLayoutEngine` | mantener API legacy viva | no, salvo para compat interna | alto | P0 |
| SelectionEngine patch bridge | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7682) | `SelectionEngine` legacy -> `SelectionEngineV19` | compat de eventos y API | no como estado permanente | crítico | P0 |
| PreviewEngine patch bridge | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7721) | `PreviewEngine` legacy -> `PreviewEngineV19` | mantener tabs/preview sin rewire completo | no como estado permanente | alto | P1 |
| DesignZoomEngine patch wrapper phase 2 | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7511) | zoom legacy -> scheduler handles tier | batching parcial | no | alto | P0 |
| DesignZoomEngine patch wrapper phase 3 | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7609) | zoom legacy -> layout/visual scheduler tiers | batching parcial | no | alto | P0 |
| DS.saveHistory patch | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L7592) | `DS.saveHistory` -> `HistoryEngine` sync expectations | coexistencia doble history | no | medio | P1 |
| Snap compatibility shim | [engines/SnapEngine.js](/home/mimi/Escritorio/RF/engines/SnapEngine.js#L144) | legacy `DS.snap()` callers -> new snap engine semantics | compat con código legacy | probablemente temporal | medio | P1 |
| `.rf-el` DOM alias injector | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L6488) | `.cr-element` runtime -> `.rf-el` expected by QA/tools | compat con suites/repos externos | no | alto | P0 |
| Legacy ID alias injector | [designer/crystal-reports-designer-v4.html](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html#L6462) | real DOM ids -> ids esperados por QA | compat externa | no | alto | P1 |
| v4/v3 runtime fallback | [reportforge_server.py](/home/mimi/Escritorio/RF/reportforge_server.py#L30) [reportforge_server.py](/home/mimi/Escritorio/RF/reportforge_server.py#L139) | v4 preferred -> v3 fallback | resiliencia histórica | solo si v4 no existe | bajo técnico, alto arquitectónico | P2 |
| `HandlesEngine.render -> SelectionEngine.renderHandles` | [engines/HandlesEngine.js](/home/mimi/Escritorio/RF/engines/HandlesEngine.js#L73) | declarative handles engine -> actual selection overlay writer | v19 facade with existing code | temporal | medio | P1 |

## Removal Guidance

- Remove bridges only after contract normalization.
- Remove DOM aliases before declaring any DOM contract done.
- Remove zoom wrappers only after one zoom engine owns the full pipeline.
