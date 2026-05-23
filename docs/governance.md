# Governance

## Qué Valida

El gate arquitectónico vive principalmente en:

- [`reportforge/tests/governance_guardrails.test.mjs`](/home/mimi/Escritorio/RF/reportforge/tests/governance_guardrails.test.mjs)
- [`validate_repo.sh`](/home/mimi/Escritorio/RF/validate_repo.sh)

Y se ejecuta con:

- `npm run test:contracts`
- `npm run test:governance`
- `npm run test:runtime`

## Qué Rompe CI

### Shell

Falla si el HTML canónico:

- contiene `<script>` inline
- contiene `<style>` inline
- contiene `style=`
- contiene `onclick=`, `onchange=`, `oninput=` u otros `on*=`
- reintroduce `function`, `const *Engine`, listeners inline o boot inline
- supera el umbral de tamaño del shell

Umbral actual:

- shell HTML `<= 30 KB`

### CSS

Falla si:

- no existe [`designer/styles/index.css`](/home/mimi/Escritorio/RF/designer/styles/index.css)
- el shell no lo carga
- reaparecen estilos inline en el shell

### Globals

Falla si:

- aparece un nuevo `window.* =` fuera de whitelist
- reaparecen exports prohibidos de engines
- reaparecen globals estructurales crudos que deben vivir en `RuntimeServices`

### Layering

Falla si:

- `UIAdapters` toca `DS` directamente
- `UIAdapters` usa `saveHistory`
- `UIAdapters` escribe canvas directamente
- `RuntimeBootstrap` reabsorbe wiring de UI o dispatch lógico
- `CommandRuntime` vuelve a registrar listeners DOM

### Growth

Falla si archivos frontera exceden sus umbrales actuales:

- shell HTML `<= 30 KB`
- `RuntimeBootstrap.js <= 12 KB`
- `UIAdapters.js <= 3 KB`
- `governance_guardrails.test.mjs <= 25 KB`

Estos límites no son estéticos. Existen para detectar recaídas estructurales.

## Whitelist de Globals

Whitelist actual de `window.* =` permitidos:

- `RF`
- `CFG`
- `FIELD_TREE`
- `SAMPLE_DATA`
- `FORMATS`
- `resolveField`
- `formatValue`
- `getCanvasPos`
- `initKeyboard_DISABLED_v19`
- `initClock`
- `__rfTraceLegacy`
- `FormulaEngine`
- `FormulaEditorDialog`
- `DesignerUI`
- `RF_DEBUG`
- `RF_DEBUG_TRACE`
- `RF_DEBUG_TRACE_RUNTIME`
- `RF_DEBUG_TRACE_ELEMENTS`
- `RF_TRACE`
- `RF_AUDIT`
- `RF_UI_TRACE`
- `RFDebugCenter`
- `DebugTrace`
- `rfTrace`
- `makePanelDraggable`
- `DebugChannelsPanel`
- `__rfConsoleGateInstalled`
- `__rfConsoleOriginal`
- `DebugTraceToggle`
- `DebugOverlay`
- `DOC_TYPES`
- `shadeColor`
- `canvas`
- `__rfVerify`
- `SnapCore/SnapState`
- `GridEngine`
- `RulerEngine`
- `WorkspaceScrollEngine`

Regla:

- no se agrega un global nuevo sin actualizar governance y justificarlo explícitamente

## Reglas Duras

- no JS inline en HTML
- no CSS inline en HTML
- no engines exportados a `window.*` salvo whitelist aprobada
- no adapters tocando `DS` directo
- no engines haciendo wiring UI general
- no bootstrap con lógica de negocio
- no globals estructurales crudos fuera de `RuntimeServices`
- no bypass del scheduler en path crítico

## Cómo Extender Sin Romper Governance

Agregar un engine:

1. crear módulo en `engines/`
2. registrar ownership claro
3. usar `DS`, `EngineCore` y `RenderScheduler`
4. no exportarlo a `window.*` salvo necesidad real aprobada
5. si necesita whitelist nueva, actualizar governance primero

Agregar UI:

1. markup en el shell
2. wiring en `UIAdapters` o adapter específico
3. dispatch a `CommandRuntime` o engine público canónico
4. no tocar `DS` desde adapter

Agregar bootstrap:

1. mantenerlo en `RuntimeBootstrap`/`DeferredBootstrap`
2. solo init y registro
3. no meter lógica de negocio ni wiring de toolbar/menu

## Flujo de Referencia

Ejemplo de toolbar:

`DOM click -> UIAdapters -> CommandRuntime -> Engine -> DS -> RenderScheduler -> DOM`

Ese es el patrón permitido.  
Cualquier ruta paralela debe considerarse sospechosa hasta que el gate la apruebe explícitamente.

## RF Debug Center Strategic Amendment

RF Debug Center sigue siendo un sidecar de ReportForge hoy, pero su contrato
está preparado para evolucionar a una plataforma portable sin acoplar el core a
internals de ReportForge.

Reglas permanentes:

- el core debe permanecer genérico
- el adapter de ReportForge concentra cualquier conocimiento específico de RF
- los futuros motores se diseñan como unidades separadas de observabilidad
- ningún motor futuro debe depender directamente de `ZoomEngine`,
  `PreviewEngineRenderer`, `GlobalEventHandlers` o cualquier otro interno de RF
  salvo en el borde del adapter correspondiente

Motores futuros aprobados:

- `Loop & Freeze Engine`
- `Performance Engine`
- `Async/Race Engine`
- `State & Ownership Engine`
- `Network/Backend Engine`
- `DOM/Visual Engine`

Contrato canónico de evidencia:

```json
{
  "timestamp": "...",
  "project": "reportforge",
  "engine": "loop|performance|async|state|network|dom",
  "module": "...",
  "source": "...",
  "action": "...",
  "severity": "debug|info|warning|error",
  "eventId": "...",
  "transactionId": "...",
  "before": {},
  "after": {},
  "state": {},
  "dom": {},
  "request": {},
  "response": {},
  "durationMs": 0,
  "ownerExpected": "...",
  "writerActual": "...",
  "invariant": "...",
  "result": "...",
  "error": null
}
```

La implementación actual sigue siendo `ReportForge Adapter v1`. Los adapters
futuros para `sap_b1_linux` y `autolab` siguen en backlog hasta su
implementación explícita.

Roadmap completado:

- `H1` hardening base — LISTO
- `E1` strategic amendment — LISTO
- `T1` timeline RF_UI_TRACE — LISTO
- `Z1` zoom diagnostics — LISTO
- `D1` DOM/visual base — LISTO
- `B1` debug bundle export — LISTO
- `W1` live warnings — LISTO
- `L1` loop & freeze engine — LISTO
- `P1` performance engine — LISTO
- `A1` async/race engine — LISTO
- `N1` network/backend engine — LISTO
- `S1` selection/drag/resize engine — LISTO
- `R1` render/preview engine — LISTO
- `V1` visual evidence / screenshots — LISTO
- `F1` final hardening — LISTO
- `X1` causal intelligence / invariant engine — LISTO
- `PORT0` adapter boundary / core contract — LISTO
- `SAP0` discovery sap_b1_linux — LISTO
- `SAP1` adapter mínimo sap_b1_linux read-only — LISTO
- `SAP2` runtime bridge sap_b1_linux instalación controlada — LISTO
- `SAP3` repro controlada bug UDF con bundle de evidencia — LISTO
- `Z2` DOM scanner adversarial advanced — LISTO

- `SAP4` parche mínimo UDF_CHILD_STALE + CREATE_MODE_DIRTY — LISTO

Siguiente fase: `SAP5` — Verificación en entorno real con bundle post-parche.

## PORT0 — Adapter Boundary

El contrato canónico del adapter vive en:

- `tools/rf-debug-center/adapters/debug-center-adapter-contract.js`

Cualquier adapter futuro debe:

1. exponer `id`, `name`, `project`, `version`
2. implementar `getTraceSource`, `getOwnershipMap`, `getEnvironment`, `normalizeEvent`
3. no escribir `window.*`
4. no mutar `RF_UI_TRACE`, `DS`, ni el DOM
5. pasar `validateAdapter()` con `{ valid: true, errors: [] }`

El adapter de ReportForge v1 vive en:

- `tools/rf-debug-center/adapters/reportforge/reportforge-adapter.js`

Los adapters de `sap_b1_linux` y `autolab` permanecen en backlog.
