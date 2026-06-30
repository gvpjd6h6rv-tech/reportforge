# RF-ARCH-MODULAR-GUARDS-PHASE-4 — Plan Split/Reclassify

> DISEÑO ÚNICAMENTE. Sin migración de archivos. Sin CI. Sin blocking. Sin commit.
> Fuente de verdad: headers RULE-A/B/C leídos directamente de cada guard.

---

## 0. Principio de ejecución

Cada columna de la matriz es un **compromiso de contrato**, no una intención:
- **Regla única** = la oración exacta que irá en el campo `rule` del guards-map.json.
- **Test futuro** = nombre del archivo que debe existir antes de marcar `blocking:true`.
- **Orden** = secuencia de migración para que las dependencias lleguen antes que sus dependientes.

`blocking:false` es invariante para todos hasta Phase 6.

---

## 1. Matriz split/reclassify

### 1.1 `error-taxonomy-guard` → 5 hijos

Guard actual: `audit/error_taxonomy_guard.mjs` (5 reglas RULE-A…E, scope `engines/EngineCoreRuntime.js`)

| id hijo | Regla única | Scope | Test futuro | Riesgo | Orden |
|---|---|---|---|---|---|
| `error-taxonomy-incident-key` | `EngineCoreRuntime.js` debe definir `incidentKey()` incluyendo los cinco campos diagnósticos: `reason, name, message, phase, priority` | `engines/EngineCoreRuntime.js` | `error_taxonomy_incident_key_guard.test.mjs` | Bajo — regla estructural sobre firma | 2 |
| `error-taxonomy-safemode-reason` | `enterSafeMode()` debe asignar `state.runtime.safeMode.reason` antes de llamar a `incidentKey()` | `engines/EngineCoreRuntime.js` | `error_taxonomy_safemode_reason_guard.test.mjs` | Bajo — orden de dos líneas conocidas | 2 |
| `error-taxonomy-last-failure` | `lastFailure` debe incluir los cuatro campos requeridos (`reason, name, message, stack`) | `engines/EngineCoreRuntime.js` | `error_taxonomy_last_failure_guard.test.mjs` | Bajo — contrato de objeto estático | 3 |
| `error-taxonomy-normalize-error` | `normalizeError()` debe existir y extraer un conjunto consistente de campos desde cualquier excepción | `engines/EngineCoreRuntime.js` | `error_taxonomy_normalize_error_guard.test.mjs` | Medio — la firma puede variar sin romper tests externos | 3 |
| `error-taxonomy-snapshot-safemode` | `exportRuntimeState()` / `buildRuntimeSnapshot()` deben incluir el bloque `safeMode` en su salida | `engines/EngineCoreRuntime.js` | `error_taxonomy_snapshot_safemode_guard.test.mjs` | Bajo — contrato de output JSON | 4 |

**Destino propuesto:** `tools/guards/error_taxonomy/`
**Padre deprecado tras migración:** `audit/error_taxonomy_guard.mjs` → `state:deprecated`

---

### 1.2 `derived-state-guard` → 4 hijos

Guard actual: `audit/derived_state_guard.mjs` (4 reglas RULE-A…D, scope `engines/DocumentSelectors.js + engines/*.js`)

| id hijo | Regla única | Scope | Test futuro | Riesgo | Orden |
|---|---|---|---|---|---|
| `derived-state-factory` | `DocumentSelectors.js` debe usar una función factory (`createDocumentSelectors`) que lee derivaciones directamente del argumento `state`, no de una copia en closure | `engines/DocumentSelectors.js` | `derived_state_factory_guard.test.mjs` | Bajo — un archivo, una firma | 2 |
| `derived-state-no-reimpl` | Ningún engine file fuera de la capa document-store puede reimplementar `getSectionTop`, `getTotalHeight` o `getSelectedElements` | `engines/*.js` excl. DocumentSelectors, DocumentStore | `derived_state_no_reimpl_guard.test.mjs` | Medio — grep sobre todos los engines | 2 |
| `derived-state-call-via-ds` | Los engine files deben llamar `DS.getSectionTop` / `DS.getTotalHeight`, nunca la función del módulo directamente | `engines/*.js` excl. DocumentSelectors | `derived_state_call_via_ds_guard.test.mjs` | Medio — false-positives en tests; necesita allowlist | 3 |
| `derived-state-store-delegates` | `DocumentStore.js` debe delegar `getSectionTop`, `getTotalHeight`, `getSelectedElements` a `DocumentSelectors` | `engines/DocumentStore.js` | `derived_state_store_delegates_guard.test.mjs` | Bajo — un archivo, tres símbolos | 3 |

**Destino propuesto:** `tools/guards/derived_state/`

---

### 1.3 `immutability-guard` → 3 hijos

Guard actual: `audit/immutability_guard.mjs` (3 reglas RULE-A…C)

| id hijo | Regla única | Scope | Test futuro | Riesgo | Orden |
|---|---|---|---|---|---|
| `immutability-history-private` | `_undoStack` y `_redoStack` deben existir únicamente dentro de `HistoryEngine.js`; ningún otro engine file puede contener esos identificadores | `engines/*.js` | `immutability_history_private_guard.test.mjs` | Bajo — identifier grep | 1 |
| `immutability-history-no-expose` | `HistoryEngine.js` no debe exponer `_undoStack` ni `_redoStack` en su objeto de retorno | `engines/HistoryEngine.js` | `immutability_history_no_expose_guard.test.mjs` | Bajo — un archivo, retorno literal | 1 |
| `immutability-ds-no-direct-assign` | Ningún engine de render puede hacer asignación directa a `DS.elements` o `DS.sections` | `engines/*.js` excl. DocumentStore | `immutability_ds_no_direct_assign_guard.test.mjs` | Medio — distinguir asignación de desestructuración | 2 |

**Destino propuesto:** `tools/guards/immutability/`

---

### 1.4 `load-order-guard` → 3 hijos

Guard actual: `audit/load_order_guard.mjs` (3 reglas RULE-A…C, scope `RuntimeBootstrap.js + DeferredBootstrap.js`)

| id hijo | Regla única | Scope | Test futuro | Riesgo | Orden |
|---|---|---|---|---|---|
| `load-order-runtime-bootstrap` | En `RuntimeBootstrap.js`, `DesignerUI.init()` debe preceder a `ZoomEngine.set()` y `SectionEngine.init()` debe preceder a `DS.saveHistory()` | `engines/RuntimeBootstrap.js` | `load_order_runtime_bootstrap_guard.test.mjs` | Bajo — orden textual en un archivo | 1 |
| `load-order-deferred-bootstrap` | En `DeferredBootstrap.js`, `RenderScheduler.flushSync` debe preceder al patch de `CanvasLayoutEngine` | `engines/DeferredBootstrap.js` | `load_order_deferred_bootstrap_guard.test.mjs` | Bajo — orden textual en un archivo | 1 |
| `load-order-engine-registry` | `DeferredBootstrap.js` debe exponer `EngineRegistry` antes de que otros módulos lo consuman | `engines/DeferredBootstrap.js` | `load_order_engine_registry_guard.test.mjs` | Medio — depende de cómo se define "consume" | 2 |

**Destino propuesto:** `tools/guards/load_order/`

---

### 1.5 `shared-core-guard` → 5 hijos

Guard actual: `audit/shared_core_guard.mjs` (5 reglas RULE-A…E, scope repo-wide)

| id hijo | Regla única | Scope | Test futuro | Riesgo | Orden |
|---|---|---|---|---|---|
| `shared-core-doc-section` | `testing-canon.md` debe contener una sección "Shared Core Standards" con el listado mínimo de suites | `testing-canon.md` | `shared_core_doc_section_guard.test.mjs` | Bajo — grep en markdown | 1 |
| `shared-core-suites-exist` | Los cuatro archivos de suite canónicos deben existir en disco | `reportforge/tests/{debuggability,governance_guardrails,engine_contracts,critical_runtime_contracts}.test.mjs` | `shared_core_suites_exist_guard.test.mjs` | Bajo — existencia de archivo | 1 |
| `shared-core-validate-exists` | `validate_repo.sh` debe existir en la raíz del repositorio | `./ (root)` | `shared_core_validate_exists_guard.test.mjs` | Bajo — existencia de archivo | 1 |
| `shared-core-audit-guards` | El directorio `audit/` debe contener al menos un archivo `*_guard.mjs` | `audit/` | `shared_core_audit_guards_guard.test.mjs` | Bajo — glob count | 1 |
| `shared-core-canon-references-guard` | `testing-canon.md` debe incluir una sección de Enforcement que referencia el guard de shared-core | `testing-canon.md` | `shared_core_canon_references_guard_guard.test.mjs` | Medio — nombre exacto puede cambiar | 3 |

**Destino propuesto:** `tools/guards/shared_core/`
**Nota:** los hijos 1–4 son completamente independientes; se pueden migrar en paralelo.

---

### 1.6 `subsystem-ownership-guard` → 4 hijos + consolidación del cluster

Guard actual: `audit/subsystem_ownership_guard.mjs` (4+1 reglas: EXIST/OVERLAP/GUARD/ORPHAN + SCHEMA implícito)

#### 1.6.1 Los 4 hijos directos

| id hijo | Regla única | Scope | Test futuro | Riesgo | Orden |
|---|---|---|---|---|---|
| `ownership-files-exist` | Cada `allowedFile` del ownership map debe existir en disco bajo `engines/` | `audit/subsystem_ownership_map.json` + `engines/` | ya existe: `subsystem_ownership_guard_rule_exist.test.mjs` | Bajo — test ya parcialmente escrito | 1 |
| `ownership-no-overlap` | Ningún `.js` de `engines/` puede aparecer en más de un subsistema salvo que esté en `sharedFiles` | `audit/subsystem_ownership_map.json` | `ownership_no_overlap_guard.test.mjs` | Medio — sharedFiles allowlist puede crecer | 2 |
| `ownership-guard-required` | Todo subsistema de nivel core en el dominio `designer-runtime` debe declarar al menos un `requiredGuardCI` o una `notes` con `"justification:"` | `audit/subsystem_ownership_map.json` | `ownership_guard_required_guard.test.mjs` | Medio — criterio "core-tier" definido en JSON | 2 |
| `ownership-no-orphan` | Todo `.js` de `engines/` debe aparecer en exactamente un subsistema del ownership map (o en `sharedFiles`) | `audit/subsystem_ownership_map.json` + `engines/` | `ownership_no_orphan_guard.test.mjs` | **Alto** — cualquier engine nuevo rompe el guard si no se registra | 2 |

#### 1.6.2 Cluster de ownership: merge propuesto

El guard padres solapa con **6 fuentes** de ownership enforcement. El cluster completo:

| Fuente actual | Layer | Cubre | Acción |
|---|---|---|---|
| `audit/subsystem_ownership_guard.mjs` (RULE-EXIST/OVERLAP/GUARD/ORPHAN) | guard | mapa JSON vs engines/ | **split → 4 hijos** (arriba) |
| `reportforge/tests/subsystem_ownership_guard_rule_exist.test.mjs` | test | RULE-EXIST aislada | **mantener** como test del hijo `ownership-files-exist` |
| `reportforge/tests/architecture_ownership_guard_cli.test.mjs` | test | CLI path del guard | **reubicar** a `tests/architecture/` en Phase 5 |
| `reportforge/tests/architecture_ownership_guard_self_ownership.test.mjs` | test | guard se auto-declara owner | **reubicar** a `tests/architecture/` en Phase 5 |
| `reportforge/tests/architecture_ownership_map_policy.test.mjs` | test | políticas del mapa | **mantener**, mover a `tests/architecture/` |
| `tools/salad-score/checkers/check_ownership_violation.mjs` | checker | ownership violation (behavioral) | **mantener** como checker independiente; no duplica reglas estructurales |
| `reportforge/tests/salad_score_check_ownership_violation.test.mjs` | test | 1:1 del checker | **mantener** como test del checker |
| `reportforge/tests/selection_interaction_ownership_guard.test.mjs` | test | capa selection+interaction | **mantener** (dominio distinto) |

**Conclusión del cluster:** no hay duplicación de *regla*, sí de *área de interés*.
Los 4 hijos estructurales + el checker behavioral `check_ownership_violation` son
complementarios, no redundantes. El merge real es: mover los 3 tests de
`architecture_ownership_*` a `tests/architecture/` en Phase 5.

**Destino propuesto:** `tools/guards/ownership/`

---

### 1.7 `ssot-guard` → reclassify: guard → runner

Guard actual: `audit/ssot_guard.mjs`
**No contiene ninguna regla propia.** Orquesta 3 guards hijo con `spawn()`:
- `subsystem_ssot_guard.mjs`
- `configurational_ssot_guard.mjs`
- `ssot_runtime_binding_guard.mjs`

| Acción | Detalle |
|---|---|
| Reclassify | `layer: guard` → `layer: runner` |
| Path destino | `tools/runners/run_ssot_guards.mjs` |
| Regla del runner | "Orquesta subsystem-ssot, configurational-ssot y ssot-runtime-binding; agrega exit codes; sin lógica de regla propia" |
| Test futuro | `tests/architecture/ssot_runner_orchestration.test.mjs` (verifica que no contiene lógica de regla) |
| Riesgo | Bajo — el comportamiento no cambia, solo la clasificación y el path |
| Orden | 4 (los 3 hijos deben migrar o estar estables antes) |

---

## 2. Resumen de expansión

| Guard actual | Reglas reales | Hijos propuestos | Delta |
|---|---|---|---|
| `error-taxonomy-guard` | 5 | 5 hijos | +4 |
| `derived-state-guard` | 4 | 4 hijos | +3 |
| `immutability-guard` | 3 | 3 hijos | +2 |
| `load-order-guard` | 3 | 3 hijos | +2 |
| `shared-core-guard` | 5 | 5 hijos | +4 |
| `subsystem-ownership-guard` | 4 | 4 hijos | +3 |
| `ssot-guard` | 0 (runner) | reclassify | 0 |
| **Total** | **24** | **24 single-rule + 1 runner** | **+18 netos** |

Catálogo actual: 73 entradas. Tras Fase 5 (cuando se registren los hijos):
**~91 entradas** — todas con `blocking:false` hasta Phase 6.

---

## 3. Orden de migración (por oleadas)

```
Oleada 1 (independientes, sin dependencia entre sí):
  immutability-history-private
  immutability-history-no-expose
  load-order-runtime-bootstrap
  load-order-deferred-bootstrap
  shared-core-doc-section
  shared-core-suites-exist
  shared-core-validate-exists
  shared-core-audit-guards
  ownership-files-exist          ← test ya parcialmente escrito

Oleada 2 (dependen de que los padres estén deprecados o estables):
  immutability-ds-no-direct-assign
  derived-state-factory
  derived-state-no-reimpl
  load-order-engine-registry
  ownership-no-overlap
  ownership-guard-required
  ownership-no-orphan
  error-taxonomy-incident-key
  error-taxonomy-safemode-reason

Oleada 3 (dependen de oleada 2 o tienen allowlists que madurar):
  derived-state-call-via-ds      ← necesita allowlist de tests
  derived-state-store-delegates
  error-taxonomy-last-failure
  error-taxonomy-normalize-error
  shared-core-canon-references-guard

Oleada 4 (dependen de que los 3 hijos de ssot estén migrados):
  ssot-guard → runner (reclassify)
  error-taxonomy-snapshot-safemode

Cluster ownership tests (Phase 5):
  architecture_ownership_guard_cli   → mover a tests/architecture/
  architecture_ownership_guard_self  → mover a tests/architecture/
  architecture_ownership_map_policy  → mover a tests/architecture/
```

---

## 4. Riesgos por guard

| Riesgo | Guards afectados | Mitigación |
|---|---|---|
| **Alto**: `ownership-no-orphan` — cualquier engine nuevo rompe el guard si no se registra en el mapa | `ownership-no-orphan` | Añadir al onboarding: "nuevo engine → registrar en subsystem_ownership_map.json" |
| **Medio**: `derived-state-call-via-ds` — false positives en archivos de test que importan selectores directamente | `derived-state-call-via-ds` | Allowlist de paths `*test*`, `*spec*` |
| **Medio**: `error-taxonomy-normalize-error` — la firma de `normalizeError` puede cambiar sin romper contratos externos | `error-taxonomy-normalize-error` | El test verifica existencia + que retorna objeto con campos mínimos, no la firma completa |
| **Medio**: `ownership-guard-required` — criterio "core-tier" definido en JSON; puede crecer silenciosamente | `ownership-guard-required` | El guard debe leer el criterio del mapa mismo, no hard-codearlo |
| **Medio**: `shared-core-canon-references-guard` — el nombre del guard en markdown puede no coincidir exactamente | `shared-core-canon-references-guard` | Test verifica substring, no match exacto |
| **Bajo**: reclassify de `ssot-guard` — renombrar path rompe referencias en npm scripts / CI | `ssot-guard` → runner | Crear alias o actualizar `package.json` y workflows en la misma oleada |

---

## 5. Lo que Phase 4 NO hace

- No registra los hijos en `guards-map.json` (eso es Phase 5).
- No mueve ningún archivo.
- No toca `validate_repo.sh`.
- No amplía `scanRoots`.
- No hace nada blocking ni CI.
- El test de Phase 2 (`tests/architecture/guards_map_contract.test.mjs`) sigue verde sin cambios.

---

## 6. UDS 4.1

- **Evidence**: cada regla hijo fue extraída del RULE-A/B/C/D/E real del archivo, no inferida del nombre.
- **No fake-green**: ningún hijo se marca `ruleReviewed:true` aquí; lo harán en Phase 5 cuando se registren con regla verificada.
- **No debt sin aceptación**: el riesgo "Alto" de `ownership-no-orphan` queda registrado con mitigación concreta.
- **Contract First**: las reglas únicas aquí son los contratos que deben ir en `guards-map.json` antes de escribir el checker.
- **No implementación antes de diseño**: Phase 4 es el diseño; Phase 5 registra; Phase 6 implementa.
