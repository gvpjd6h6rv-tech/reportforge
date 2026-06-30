# RF-ARCH-MODULAR-GUARDS-PHASE-6 — Audit de Equivalencia

> Strangler Fig: guards nuevos coexisten con los viejos. Ningún legacy eliminado.
> `validate_repo.sh` intacto. `scanRoots` intacto. `blocking:false` en todo.
> No commit hasta este documento + tests verdes.

---

## Matriz de equivalencia (Oleada 1)

| Old Guard | New Guard(s) | Misma Regla | Resultado Legacy | Resultado Modular | Equiv |
|---|---|---|---|---|---|
| `immutability_guard.mjs` (RULE-A) | `immutability/immutability_history_private.mjs` | Sí — mismo regex `/_undoStack\|_redoStack/`, mismo scope `engines/*.js \ HistoryEngine.js` | PASS | PASS | **YES** |
| `immutability_guard.mjs` (RULE-B) | `immutability/immutability_history_no_expose.mjs` | Sí — mismo patrón `return {` + `/\bundoStack\s*[,}]/` | PASS | PASS | **YES** |
| `load_order_guard.mjs` (RULE-A) | `load_order/load_order_runtime_bootstrap.mjs` | Sí — mismo `before()` con mismos regex sobre `RuntimeBootstrap.js` | PASS | PASS | **YES** |
| `load_order_guard.mjs` (RULE-B) | `load_order/load_order_deferred_bootstrap.mjs` | Sí — mismos 3 `before()` sobre `DeferredBootstrap.js` | PASS | PASS | **YES** |
| `shared_core_guard.mjs` (RULE-A) | `shared_core/shared_core_doc_section.mjs` | Sí — mismo `/Shared Core Standards/` + `/validate_repo\.sh/` | PASS | PASS | **YES** |
| `shared_core_guard.mjs` (RULE-B) | `shared_core/shared_core_suites_exist.mjs` | Sí — mismas 4 suites, mismo `fs.existsSync` | PASS | PASS | **YES** |
| `shared_core_guard.mjs` (RULE-C) | `shared_core/shared_core_validate_exists.mjs` | Sí — mismo check de existencia de `validate_repo.sh` | PASS | PASS | **YES** |
| `shared_core_guard.mjs` (RULE-D) | `shared_core/shared_core_audit_guards.mjs` | **Diferencia de scope documentada** (ver abajo) | PASS | PASS | **YES** |
| `subsystem_ownership_guard.mjs` (RULE-EXIST) | `ownership/ownership_files_exist.mjs` | Sí — mismo `checkFilesExist` exportado por el mismo guard | PASS | PASS | **YES** |

### Diferencia documentada: `shared_core_audit_guards`

| Aspecto | Legacy (`SHARED-GUARDS-001`) | Modular |
|---|---|---|
| Filtro de archivos | `f.endsWith('.mjs')` — **todos** los .mjs de audit/ | `f.endsWith('_guard.mjs')` — solo los guards |
| Umbral | ≥5 | ≥5 |
| Resultado hoy | PASS (55+ .mjs) | PASS (49 `*_guard.mjs`) |

La diferencia es intencionada: el modular es más preciso. Ambos pasan hoy.
Si en el futuro hubiera <5 `*_guard.mjs` y ≥5 .mjs genéricos, divergirían.
**Aceptado como mejora, no como bug.** Si se desea, el legacy podría afinarse en Oleada 2.

---

## Evidencia de validación (comandos reproducibles)

```bash
# Dual mode completo — 4/4 equivalencias, exit 0
node tools/cli/guards_cli.mjs --mode=dual

# Test de equivalencia en vivo (definitive gate)
node --test tests/architecture/runner_dual_equivalence.test.mjs

# Todos los tests (58 en total)
node --test \
  tests/architecture/guards_map_contract.test.mjs \
  tests/architecture/runner_discovers_modular_guards.test.mjs \
  tests/architecture/runner_executes_both_modes.test.mjs \
  tests/architecture/runner_detects_divergences.test.mjs \
  tests/architecture/runner_generates_report.test.mjs \
  tests/architecture/runner_no_state_mutation.test.mjs \
  tests/architecture/runner_dual_equivalence.test.mjs \
  tests/architecture/immutability_history_private.test.mjs \
  tests/architecture/immutability_history_no_expose.test.mjs \
  tests/architecture/load_order_runtime_bootstrap.test.mjs \
  tests/architecture/load_order_deferred_bootstrap.test.mjs \
  tests/architecture/shared_core_doc_section.test.mjs \
  tests/architecture/shared_core_suites_exist.test.mjs \
  tests/architecture/shared_core_validate_exists.test.mjs \
  tests/architecture/shared_core_audit_guards.test.mjs \
  tests/architecture/ownership_files_exist.test.mjs
```

---

## Estado de los guards legacy (intactos)

```
audit/immutability_guard.mjs          ← intacto, sigue corriendo
audit/load_order_guard.mjs            ← intacto
audit/shared_core_guard.mjs           ← intacto
audit/subsystem_ownership_guard.mjs   ← intacto
```

No se eliminó, renombró ni modificó ningún guard antiguo.

---

## Runner modular — estructura

```
tools/runners/run_guards.mjs          ← orquestación pura (no lógica de regla)
tools/collectors/collect_modular_guards.mjs
tools/collectors/collect_legacy_guards.mjs
tools/executors/execute_modular_guard.mjs
tools/executors/execute_legacy_guard.mjs
tools/comparators/compare_results.mjs
tools/reporters/build_report.mjs
tools/cli/guards_cli.mjs              ← I/O puro (argv → runner → exit 0)
reports/guards_migration_report.json  ← artefacto de evidencia
```

---

## Restricciones verificadas

| Restricción | Estado |
|---|---|
| `blocking:false` en todo el catálogo | ✅ (tests lo verifican) |
| `validate_repo.sh` intacto | ✅ (no tocado) |
| Guards legacy intactos | ✅ (solo lectura) |
| `scanRoots` sin cambios | ✅ |
| CI sin cambios | ✅ |
| Runner no muta estado | ✅ (test `runner_no_state_mutation`) |
| Exit siempre 0 | ✅ (`blocking:false` enforced en CLI) |
