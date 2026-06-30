# RF-ARCH-MODULAR-GUARDS-PHASE-1 — AUDIT ONLY

> Estado: AUDITORÍA. No implementación. No modificación de código. No commit.
> Objetivo (no ejecutado aquí): arquitectura modular de guards/checkers/runners
> para que la repo se defienda sola.
> Reglas base: 1 file = 1 tarea · 1 guard = 1 responsabilidad · 1 checker = 1 regla ·
> 1 runner = orquestación · 1 map = datos · CLI = I/O · 1 test = 1 contrato.

---

## 0. Hallazgo de partida (no es greenfield)

La repo **ya tiene** un esqueleto modular de guards que cumple gran parte de las
reglas base. No hay que inventar la taxonomía: hay que **consolidar, ampliar
cobertura y cerrar huecos**.

Activos existentes:
- `tools/salad-score/` — sistema modular completo y ejemplar:
  `bin/`(CLI) · `runner/` · `checkers/` (1 export = 1 regla, verificado) ·
  `collectors/` · `contracts/` · `maps/` · `metrics/` · `normalizers/` ·
  `reporters/` · `scoring/`. **Pero `scanRoots: ["engines"]`** → sólo audita
  `engines/`, ignora py/sh/css/html/tools/tests.
- `audit/*.mjs` — **55** guards de subsistema (`ssot_guard`,
  `subsystem_ownership_guard`, `error_taxonomy_guard`, `e2r_guard`, …).
- `reportforge/tests/` — tests de arquitectura con **single-contract** ya
  enforced (`salad_score_check_guard_single_rule`,
  `*_checker_single_contract`, `*_test_single_contract`, `architecture_matrix`).
- `.github/workflows/architecture-governance.yml` + `ci-extended` +
  `debugging_policy` — CI ya corre contracts/governance/runtime.
- `validate_repo.sh` (1108 LOC) + **53** `repo-*.sh` en root — runners de smoke
  dispersos y parcialmente monolíticos.

Conclusión: el trabajo de Phase-1 es **auditar la dispersión** (salad-score sólo
ve `engines/`; 55 guards sueltos en `audit/`; 53 runners `.sh` en root) y
proponer su unificación bajo `tools/{guards,checkers,runners,maps,cli}` +
`tests/architecture/`, ampliando cobertura a todos los tipos de archivo.

---

## 1. Inventario actual (por clúster — altitud de arquitectura)

> No se listan los ~800 archivos uno por uno; se inventaría por clúster con los
> peores ofensores nombrados. Tamaños en LOC.

| Archivo / clúster | Tipo | Responsabilidades detectadas | Tamaño | Riesgo | Acción propuesta |
|---|---|---|---|---|---|
| `tools/salad-score/checkers/*` (≈12) | mjs | 1 checker = 1 regla (cumple) | 7–22 c/u | Bajo | Mantener; mover a `tools/checkers/` canónico |
| `tools/salad-score/runner/run_salad_score.mjs` | mjs | orquestación pura (cumple) | 106 | Bajo | Promover a `tools/runners/` |
| `tools/salad-score/bin/salad-score.mjs` | mjs | CLI I/O | 108 | Bajo | Mover a `tools/cli/` |
| `tools/salad-score/maps/ownership-map.json` | json | sólo datos (cumple) | 10 | Bajo | Mover a `tools/maps/` |
| `salad-score.config.json` | json | config + `scanRoots:["engines"]` | 50 | **Alto** | Ampliar scanRoots a toda la repo |
| `audit/*.mjs` (55 guards) | mjs | guards sueltos, naming inconsistente, sin contrato común | 55 archivos | **Alto** | Catalogar en `tools/maps/guards-map.json`; normalizar contrato |
| `validate_repo.sh` | sh | **monolito**: descubre, ejecuta, reporta, parsea, agrega | 1108 | **Crítico** | Descomponer en runner + checkers + reporter |
| `repo-*.sh` (53 en root) | sh | runners smoke por dominio; varios monolíticos | 53 archivos | **Alto** | Mover a `tools/runners/`; 1 runner = orquestación |
| `repo-designer-god.sh` | sh | múltiples chequeos designer en un archivo | 659 | **Crítico** | Split por responsabilidad |
| `designer/crystal-reports-designer-v3.html` | html | UI + FIELD_TREE + SAMPLE_DATA + lógica inline | 4620 | **Crítico** | Fuera de scope guards; marcar como god-file conocido |
| `reports/salad-score-dashboard.html` | html | dashboard generado | 4149 | Medio | Verificar que es artefacto (¿debe versionarse?) |
| `ci/check_js.py`, `ci/check_runtime.py` | py | checks CI mezclados con diagnóstico | 18 / 247 | Medio | Separar check de diagnóstico (`no-ci-diagnostics`) |
| `engines/*.js` (≈160) | js | ya auditados por salad-score | 50–660 | Medio | Cobertura OK; aplicar `file-size` cap por tipo |
| `reportforge/core/render/datasource/*.py` | py | SQL prepared, sin concat (verificado limpio) | 26–157 | Bajo | Añadir `no-sql-concat` guard preventivo |
| `engines/PreviewEngine*.js` | js | consume dataset, sin SQL (verificado) | — | Bajo | Añadir `no-preview-sql` guard preventivo |
| `reportforge/tests/artifacts/*.png` | bin | artefactos PNG | — | Bajo | Dir **ya gitignored**; añadir `no-artifacts-committed` guard |
| `reportforge/tests/governance_guardrails.test.mjs` | mjs | múltiples reglas en un test | 1877 | **Alto** | Split: 1 test = 1 contrato |

### Evidencia recogida (UDS: no afirmación sin evidencia)
- `grep` SQL-concat en `datasource/*.py` → **0 hits** (limpio hoy; el guard sería
  preventivo, no correctivo).
- `grep` secrets hardcoded → sólo **fixtures de test** (`rf_debug_center_*` usan
  `password:'secret'` a propósito para probar redacción) → el guard necesita
  **allowlist de fixtures**.
- `reportforge/tests/artifacts/` está en `.gitignore` → artefactos **no
  commiteados** hoy; guard preventivo.
- salad-score `scanRoots:["engines"]` → py/sh/css/html/tools **sin cobertura**.

---

## 2. Taxonomía modular propuesta

Consolidar lo disperso bajo una raíz única (promoviendo lo de `tools/salad-score/`):

```
tools/
  guards/        # 1 guard = 1 responsabilidad  (envuelve 1+ checkers + decide pass/fail)
  checkers/      # 1 checker = 1 regla pura (input: filePath,text → {value,evidence})
  runners/       # 1 runner = sólo orquestación (collectors→checkers→reporter)
  maps/          # 1 map = sólo datos (ownership, guards-map, type-caps, allowlists)
  cli/           # CLI = sólo entrada/salida (args → runner → exit code)
  collectors/    # descubrimiento de archivos / texto / owner
  reporters/     # console/json/markdown (sin lógica de decisión)
tests/
  architecture/  # 1 test = 1 contrato de 1 guard
```

Mapeo desde el estado actual:
- `tools/salad-score/checkers/*` → `tools/checkers/`
- `tools/salad-score/runner/*` → `tools/runners/`
- `tools/salad-score/bin/*` → `tools/cli/`
- `tools/salad-score/maps/*` + `audit/subsystem_ownership_map.json` → `tools/maps/`
- `audit/*_guard.mjs` (55) → `tools/guards/` (normalizando contrato)
- `repo-*.sh` (53) + `validate_repo.sh` → `tools/runners/` descompuestos
- tests `salad_score_*` / `architecture_*` → `tests/architecture/`

---

## 3. Reglas de tamaño (LOC cap por tipo)

Basadas en el cap existente de salad-score (`loc:400`) y los ofensores reales:

| Tipo | Cap blando | Cap duro (falla) | Justificación |
|---|---|---|---|
| JS / MJS | 250 | 400 | cap actual salad-score; checkers reales <25 |
| Shell (sh) | 120 | 250 | `repo-designer-god.sh`=659, `validate_repo.sh`=1108 son outliers a romper |
| CSS | 200 | 400 | scope por owner (regla CSS de CLAUDE.md) |
| HTML | 300 | 600 | excluye god-files legacy declarados (designer v3) vía allowlist |
| Python | 250 | 500 | tests grandes (`test_enterprise.py`=1116) a dividir |
| Tests (mjs/py) | 200 | 400 | 1 test = 1 contrato; `governance_guardrails`=1877 es violación |

> Los god-files legacy (designer HTML) entran en una **allowlist explícita con
> fecha de aceptación** (UDS: no technical debt sin aceptación), no se exceptúan
> en silencio.

---

## 4. Guards mínimos

| Guard | Regla única | Archivos que revisa | Test requerido | Estado actual |
|---|---|---|---|---|
| `file-size` | LOC ≤ cap del tipo | todos | `test_file_size_cap_per_type` | Parcial (`check_no_god_file`, sólo engines) |
| `single-responsibility` | 1 archivo = 1 export/tarea por capa | guards/checkers/runners/cli | `test_single_responsibility` | Existe (`check_guard_single_rule`) — ampliar scope |
| `no-hardcoded-secrets` | sin literales de secreto (allowlist fixtures) | js/mjs/py/sh/json | `test_no_secret_literal` + `test_fixture_allowlist` | **Falta** |
| `no-sql-concat` | SQL sólo con params/`text()`, nunca `+`/f-string | py (datasource/core) | `test_no_sql_concat` | **Falta** (hoy limpio) |
| `no-preview-sql` | PreviewEngine no importa db/sql ni hace fetch | `engines/PreviewEngine*` | `test_preview_has_no_sql` | **Falta** (hoy limpio) |
| `no-global-owner-crossing` | sólo el owner escribe su contenedor/estado | js (engines) | `test_owner_exclusive_write` | Parcial (`check_ownership_violation`, `check_role_violation`) |
| `no-monolithic-runner` | runner sólo orquesta, sin lógica de regla inline | runners/`*.sh` | `test_runner_orchestration_only` | Parcial (`check_runner_only_orchestration`) — no cubre `.sh` |
| `no-multi-rule-checker` | checker exporta exactamente 1 regla | checkers | `test_checker_single_rule` | Existe (`check_checker_single_contract`) |
| `no-ci-diagnostics` | CI ejecuta checks, no incrusta diagnóstico/heurística | `ci/*`, workflows | `test_ci_no_diagnostics` | **Falta** |
| `no-artifacts-committed` | binarios/artefactos no versionados | repo (vs `.gitignore`) | `test_no_committed_artifacts` | **Falta** (hoy gitignored) |

> Cada guard envuelve checkers puros; la **decisión pass/fail** (umbral, allowlist)
> vive en el guard, la **regla** en el checker, los **datos** (caps, allowlists)
> en `tools/maps/`. CLI sólo traduce a exit code.

---

## 5. Plan de fases

| Fase | Entregable | Criterio de salida |
|---|---|---|
| **1 — Audit** | este documento | inventario + taxonomía + huecos con evidencia |
| **2 — Contrato de guards** | `tools/maps/guard-contract.md` + shape `{value,evidence}` único | todos los guards futuros cumplen un contrato común |
| **3 — Primer set mínimo** | los 4 guards faltantes (`no-hardcoded-secrets`, `no-sql-concat`, `no-preview-sql`, `no-artifacts-committed`) | cada uno con su test 1:1, verde sobre repo actual |
| **4 — Runner orquestador** | `tools/runners/run_guards.mjs` (sólo orquestación) | corre todos los guards, agrega, sin lógica de regla |
| **5 — Tests de arquitectura** | `tests/architecture/*` 1 test = 1 contrato; split de `governance_guardrails` | cada guard tiene exactamente 1 test de contrato |
| **6 — Integración CI** | job `guards` en `architecture-governance.yml` | blocking en PR; artefactos sólo on-failure |
| **7 — UDS 4.1 gate** | gate que exige evidencia + ownership + no fake-green | PR sin evidencia o sin owner → bloqueado |

---

## 6. UDS 4.1 — aplicación

- **Contract + Ownership First**: cada guard declara su contrato (`{value,evidence}`)
  y su owner en `tools/maps/guards-map.json` antes de implementarse. Sin owner →
  no entra al runner.
- **No fake-green**: los guards de Fase 3 deben pasar sobre el estado **real** de
  la repo (verificado: sql-concat limpio, secrets sólo en fixtures, artifacts
  gitignored). Nada de stubs que devuelven `true`.
- **No evidence debt**: cada afirmación de este audit tiene `grep`/`wc` detrás
  (sección 1). Toda violación futura emite `evidence[]` con archivo+motivo.
- **No technical debt sin aceptación**: los god-files legacy
  (`designer/crystal-reports-designer-v3.html` 4620, `validate_repo.sh` 1108,
  `governance_guardrails.test.mjs` 1877) van a **allowlist con fecha**, no a
  excepción silenciosa.
- **No root cause sin evidencia**: la dispersión (salad-score sólo `engines/`;
  55 guards en `audit/`; 53 `.sh` en root) está demostrada, no asumida.
- **No implementación antes del audit**: este documento es el gate de Fase 1; no
  se escribió ni movió código.

---

## 7. Riesgos

1. **Doble fuente de guards**: `audit/*.mjs` (55) y `tools/salad-score/` coexisten;
   migrar sin congelar uno crea drift. Mitigar con `guards-map.json` como SSOT.
2. **Ampliar scanRoots** a py/sh/html disparará muchas violaciones de golpe
   (god-files) → necesita allowlist fechada antes de poner el gate blocking.
3. **Secrets en fixtures**: guard sin allowlist daría falsos positivos en
   `rf_debug_center_*` tests.
4. **53 runners `.sh`**: descomponer `validate_repo.sh`/`repo-designer-god.sh` es
   alto esfuerzo; arriesga romper CI si se hace sin tests de paridad de salida.
5. **HTML god-files**: 4620 LOC con lógica inline no son auditables por checkers
   de LOC sin reglas especiales; declarar fuera de scope explícitamente.

---

## 8. NO IMPLEMENTACIÓN / NO FIX

Auditoría únicamente. No se creó ningún guard, no se movió código, no se modificó
`scanRoots`, no se commiteó. Próximo paso (si se aprueba Fase 2): redactar el
contrato común de guards y el `guards-map.json` SSOT antes de tocar `tools/`.
