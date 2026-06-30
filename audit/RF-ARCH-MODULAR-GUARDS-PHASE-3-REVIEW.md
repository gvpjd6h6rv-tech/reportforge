# RF-ARCH-MODULAR-GUARDS-PHASE-3 — Registro + Review (parcial)

> Sin enforcement · sin CI · sin blocking · sin migrar archivos ·
> `validate_repo.sh` intacto · `scanRoots` intacto.
> Contract test: **11 pass / 0 fail**.
> Catálogo: 73 entradas (68 existing + 5 planned).

## 1. Guards faltantes registrados (`state:planned`)

| id | regla (1 sola) | owner | scope | test futuro | blocking |
|---|---|---|---|---|---|
| `no-hardcoded-secrets` | un archivo no-test no debe contener un literal secreto | rf-architecture | js/mjs/py/sh/json, excl. fixtures (allowlist) | `tests/architecture/no_hardcoded_secrets_guard.test.mjs` | false |
| `no-sql-concat` | un SQL debe ir parametrizado, nunca concatenado | rf-architecture | `datasource/**`, services SQL | `…/no_sql_concat_guard.test.mjs` | false |
| `no-preview-sql` | un archivo PreviewEngine no importa db/sql ni hace fetch | rf-architecture | `engines/PreviewEngine*.js` | `…/no_preview_sql_guard.test.mjs` | false |
| `no-ci-diagnostics` | un step de CI ejecuta un check, no incrusta heurística | rf-architecture | `ci/*`, `.github/workflows/*` | `…/no_ci_diagnostics_guard.test.mjs` | false |
| `no-artifacts-committed` | un artefacto build/test no debe estar trackeado en git | rf-architecture | árbol vs `.gitignore` | `…/no_artifacts_committed_guard.test.mjs` | false |

Los 5 llevan `recommendation:clean` con `reviewNote` indicando que Phase-1 ya
verificó que la repo está limpia hoy → serán guards **preventivos** (no
correctivos). `pathPlanned` apunta a `tools/guards/` (destino), `pathCurrent:null`.

## 2. Grupo revisado (lote pequeño = 8 guards)

Solo **1 de 8** cumple "1 guard = 1 regla" tal cual. El resto declara RULE-A/B/C
→ son **multi-regla** y se marcan honestamente (`ruleReviewed:false`,
`recommendation:split`), no se les inventa una regla única (evita fake-green).

| guard | rules reales | resultado | recomendación |
|---|---|---|---|
| `font-stack-guard` | 1 | **revisado ✓** `ruleReviewed:true` | clean |
| `error-taxonomy-guard` | 2 (incidentKey, safeMode reason) | ambiguo | **split** → 2 |
| `derived-state-guard` | 2 (factory, no-reimpl) | ambiguo | **split** → 2 |
| `immutability-guard` | 3 (hist-private, no-expose, ds-assign) | ambiguo | **split** → 3 |
| `load-order-guard` | 2 (boot, deferred) | ambiguo | **split** → 2 |
| `shared-core-guard` | 2 (doc, suites-exist) | ambiguo | **split** → 2 |
| `subsystem-ownership-guard` | 4 (exist/overlap/guard/orphan) | ambiguo | **split** → 4 |
| `ssot-guard` | orquesta 3 guards hijos | mal clasificado | **reclassify** guard→runner |

## 3. Reporte solicitado

### Revisados (finalizados, `ruleReviewed:true`)
- `font-stack-guard` (1 regla, owner `rf-rendering`, scope `engines/*.js` excl. FontStack.js, test definido).
- + los 5 `planned` (reglas únicas redactadas desde cero).
- **Total reviewed:true = 9 / 73.**

### Ambiguos (multi-regla, requieren split)
`error-taxonomy-guard`, `derived-state-guard`, `immutability-guard`,
`load-order-guard`, `shared-core-guard`, `subsystem-ownership-guard`.
→ 6 guards que expanden a **15** guards single-rule al dividirse.

### Duplicados / clusters a fusionar
- **Ownership cluster**: `subsystem-ownership-guard` (audit) solapa con los tests
  `architecture_ownership_*`, `subsystem_ownership_map_policy`,
  `salad_score_check_ownership_violation` y el checker `check_ownership_violation`.
  → candidato a **merge** bajo un único owner de regla de ownership.
- **SSOT cluster**: `ssot-guard` (runner) compone `subsystem_ssot_guard` +
  `configurational_ssot_guard` + `ssot_runtime_binding_guard`. No duplican regla,
  pero el "guard" padre debe reclasificarse a runner.

### Candidatos a merge/split (resumen)
| Acción | Guards | Resultado |
|---|---|---|
| split | 6 multi-regla | → 15 single-rule |
| reclassify | `ssot-guard` | guard → runner |
| merge | ownership cluster (≥4 fuentes) | 1 familia de ownership con sub-reglas |

## 4. Estado del catálogo

| Métrica | Valor |
|---|---|
| total entradas | 73 |
| existing | 68 |
| planned | 5 |
| ruleReviewed:true | 9 |
| pendientes de review | 64 |
| blocking:true | 0 |

## 5. UDS 4.1

- **No fake-green**: guards multi-regla NO se marcan revisados con una regla
  inventada; quedan `ruleReviewed:false` + `recommendation:split` + `reviewNote`
  con la evidencia (RULE-A/B/C leídos del propio archivo).
- **Evidence**: cada `reviewNote` cita las reglas reales del header del guard.
- **Ownership First**: cada revisado tiene owner concreto (`rf-rendering`,
  `rf-state`, `rf-runtime`, `rf-architecture`).
- **No technical debt sin aceptación**: el split/merge/reclassify queda
  registrado como recomendación aceptada, no como excepción silenciosa.
- **No enforcement antes de tiempo**: nada blocking, sin CI, sin migración.

## 6. Próximo (Phase 4 — no iniciado)
Runner orquestador (`tools/runners/run_guards.mjs`) que lea `guards-map.json` y
ejecute solo los `ruleReviewed:true` en modo report (no blocking). Antes de eso,
seguir revisando lotes pequeños y ejecutar los splits recomendados.
