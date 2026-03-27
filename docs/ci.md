# CI — Guía de la pipeline

## Diseño general

La CI tiene dos workflows:

| Workflow | Fichero | Cuándo corre | Bloquea PR |
|---|---|---|---|
| `ci` | `architecture-governance.yml` | push/PR sobre `main` | **sí** |
| `ci-extended` | `ci-extended.yml` | nightly 03:00 UTC + dispatch manual | no |

---

## Workflow `ci` — checks bloqueantes

Se activa en todo push o PR hacia `main`. Tres jobs independientes (los dos últimos esperan a `fast-checks`):

```
fast-checks  ─────────────────────────────────►  ~2 min
                 │
                 ├── runtime-suite  ───────────►  ~15 min
                 │
                 └── user-parity-blocking  ────►  ~25 min
```

### Job `fast-checks` (contratos + gobernanza)

- Sin browser, sin servidor Python.
- Corre: `test:contracts` y `test:governance`.
- Falla rápido si algo en la arquitectura base se rompe.
- Timeout: 5 min.

### Job `runtime-suite` (regresión de arquitectura)

- Necesita Python server + Chromium.
- Corre: `test:runtime` (265 tests: run_runtime_regression + format_controls + tanda1–11).
- Timeout: 20 min.
- Artifacts en fallo: `reportforge/tests/artifacts/`.

### Job `user-parity-blocking` (smoke gates + corpus)

Corre los 6 tests de parity que más sustituyen smoke manual:

| Test | Flow cubierto |
|---|---|
| `fast_interaction_smoke` | clicks, hover, teclado |
| `resize_smoke` | handles de resize + parity modelo/DOM |
| `zoom_extremes_smoke` | zoom 0.1 y 4.0, bordes del canvas |
| `content_edit_smoke` | edición de texto → modelo → undo |
| `template_smoke` | carga de template, estado inicial |
| `session_replay` | corpus 11 sesiones: clipboard, drag, undo/redo, mode switch, zoom |

- Browser: Chromium únicamente.
- Timeout: 30 min (session_replay tiene timeout interno de 600s).
- Artifacts en fallo: `artifacts/` + `user_parity/visual/`.

---

## Workflow `ci-extended` — suite extendida (nightly)

No bloquea PRs. Corre automáticamente cada noche a las 03:00 UTC, o manualmente desde GitHub Actions → `ci-extended` → `Run workflow`.

Corre los 10 tests de parity excluidos del blocking path:

| Test | Razón de exclusión del blocking |
|---|---|
| `clipboard_design_preview_parity` | cross-browser, más lento |
| `clipboard_visible_composition` | cross-browser, más lento |
| `multiselect_drag` | cross-browser, medición de jitter |
| `multiselect_frame_glitch` | chromium-only, temporal per-frame, no smoke |
| `preview_clipping` | chromium-only, geometría de clipping, raramente regresa |
| `selection_handle_stacking` | chromium-only, detalle de stacking/hit-test |
| `undo_redo` | cross-browser; cubierto parcialmente por session_replay |
| `undo_redo_mixed_history` | chromium-only, profundidad de stack compleja |
| `visual_golden` | pixel goldens, sensible a entorno de render |
| `flaky_detection` | diagnóstico (2 iteraciones), no gate de corrección |

Browsers: Chromium + Firefox. WebKit no instalado en CI (ver política de browsers).

---

## Política de browsers

| Browser | CI blocking | CI extended | Local |
|---|---|---|---|
| Chromium | **sí** | sí | sí |
| Firefox | no | sí | sí (si disponible) |
| WebKit | **no** | no | sí (si disponible) |

**Por qué WebKit no está en CI**: requiere librerías de sistema específicas poco fiables en `ubuntu-latest`. Los tests que llaman `getBrowserAvailability()` lo saltan automáticamente cuando no está disponible. No se inventa cobertura.

---

## Cómo interpretar fallos

### ¿Qué job falló?

El nombre del job indica qué tipo de fallo es:
- `fast-checks` → regresión de contrato o gobernanza. No necesita browser.
- `runtime-suite` → regresión de arquitectura en algún tanda1–11, format_controls, o run_runtime_regression.
- `user-parity-blocking` → fallo en smoke manual o en sesión del corpus.

### ¿Qué test falló?

El output de `node --test` muestra el nombre exacto del test y el error. Ejemplo:
```
not ok 3 - USER-PARITY resize smoke: handle SE parity
  ---
  resize handle: critical occlusion — occludedRatio=1 [{"id":"e101",...}]
```

### ¿Qué browser falló?

Los tests cross-browser incluyen `browser=<name>` en el subtítulo del test:
```
not ok 5 - multiselect drag separation browser=firefox
```
En el blocking path todo es Chromium, así que el browser está fijo.

### Artifacts

En fallo se suben como `runtime-artifacts-<run_id>` o `parity-blocking-artifacts-<run_id>`:
- `reportforge/tests/artifacts/` — screenshots capturados por el harness
- `reportforge/tests/user_parity/visual/` — goldens actuales (extended)

Los artifacts se conservan 7 días (14 en extended).

### `SCORE QUALITY WARNING`

No es un fallo. Indica que el confidence score de una sesión tiene pocas señales discriminantes. Ver `user_parity/README.md` para interpretación.

### `UNSTABLE` en flaky_detection

Solo aparece en extended. No falla la suite; es señal diagnóstica de timing.

---

## Correr localmente lo mismo que CI

### fast-checks
```sh
npm run test:contracts
npm run test:governance
```

### runtime-suite
```sh
npm run test:runtime
```
Necesita Python 3.11 y `python3 reportforge_server.py` arrancable (el harness lo hace automáticamente).

### user-parity-blocking
```sh
npm run test:parity:blocking
```

### user-parity-extended
```sh
npm run test:parity:extended
```
Firefox disponible localmente mejora la cobertura cross-browser.

### Suite completa de arquitectura
```sh
npm run test:arch
```

---

## Configuración de browsers en CI

CI usa `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci` para evitar descargas duplicadas, seguido de instalación explícita:

```sh
npx playwright install --with-deps chromium          # blocking jobs
npx playwright install --with-deps chromium firefox  # extended job
```

El harness (`runtime_harness.mjs`) busca primero el browser gestionado por Playwright (`~/.cache/ms-playwright`), y si no lo encuentra, cae a candidatos del sistema. En CI siempre usa el gestionado.

---

## Riesgos y límites conocidos

| Riesgo | Descripción |
|---|---|
| `visual_golden` sensible a entorno | Goldens generados en macOS pueden diferir del render de ubuntu-latest. Mantener goldens actualizados desde el mismo entorno de CI o aceptar un margen de píxeles. |
| `session_replay` duración | 11 sesiones en chromium pueden tardar hasta 10 min. Si el corpus crece, revisar timeout (actualmente 600s). |
| WebKit en extended | No está en CI. Los tests multi-browser corren en chromium + firefox y saltan webkit. Esto queda documentado explícitamente en los logs (`getBrowserAvailability` emite disponibilidad por browser). |
| `flaky_detection` no bloquea | Detecta inestabilidad pero no falla el check. Revisar manualmente si aparece `UNSTABLE` en logs nightly. |
| `npm ci` requiere lockfile sincronizado | Si `package-lock.json` está desactualizado respecto a `package.json`, `npm ci` falla. Corregir con `npm install` local y commitear el lockfile actualizado. |
