# User Parity Suite

Objetivo: reproducir síntomas visibles reales del usuario y comparar automáticamente:

- modelo (`DS.elements`)
- render en Diseño (`.cr-element:not(.pv-el)`)
- render en Preview (`#preview-content .pv-el`)
- síntoma visual observable (`sel-box`, clones visibles, overlay)

## Reglas

1. Un bug de UI no queda cerrado sin regresión automática del síntoma visible.
2. Pasar invariants internas no basta si el síntoma humano no queda cubierto.
3. Si smoke manual falla, el bug sigue abierto aunque esta suite pase.
4. La prioridad es paridad observable, no detalles internos aislados.

---

## Qué cubre el sistema hoy

| Capa | Qué mide | Dónde |
|---|---|---|
| Parity (model/design/preview) | IDs visibles == IDs en modelo | todos los tests |
| Geometry | bounding rects no degenerados | `collectElementVisibility` |
| Visibility | display, opacity, viewport | `visibilitySignal` |
| Hit-testing | `elementFromPoint` alcanza el elemento | `hitTestingSignal` |
| Oclusión sutil | 9 puntos (center+quadrants+edges) → occludedRatio | `measureOcclusionDetail` |
| Separación visual | minGapPx, maxOverlapRatio, collapseRisk | `cloneSeparationQuality` |
| Clipping | visibleRatio vs clip ancestors | `clippingSignal` |
| Stacking | proxy via hit-testing | `hitTestingSignal` |
| Temporal stability | frames consecutivos, jitterScore, frameDropDetected | `computeMicroJitterScore` |
| Legibility | contrast ratio + font size | `legibilitySignal` |
| Cross-browser | chromium + firefox + webkit | tests con `getBrowserAvailability` |
| Session replay | corpus de sesiones promovidas → parity + composition | `session_replay_user_parity.test.mjs` |
| Flaky detection | 2 iteraciones del mismo flow → variación de jitter | `flaky_detection_user_parity.test.mjs` |

## Cómo añadir una sesión

### 1. Crear el JSON en `sessions/`

```json
{
  "schemaVersion": 1,
  "meta": {
    "name": "nombre-descriptivo-con-guiones",
    "source": "promoted-from-real-flow",
    "bugRisk": "qué bug o síntoma visual cubre",
    "covers": ["label_principal", "fine-composition"]
  },
  "staticLabels": ["clipboard_flow", "fine-composition"],
  "actions": [
    { "type": "click", "target": { "kind": "design-text", "text": "VALOR TOTAL", "nth": 0 }, "afterWaitMs": 120 },
    { "type": "key", "key": "Control+c", "afterWaitMs": 80 },
    { "type": "key", "key": "Control+v", "afterWaitMs": 180 }
  ],
  "checkpoints": [
    {
      "label": "after-paste",
      "expect": { "textIncludes": "VALOR TOTAL", "modelCount": 2 }
    }
  ]
}
```

### 2. Tipos de acción soportados

| tipo | campos obligatorios | notas |
|---|---|---|
| `click` | `target` | `kind`: `design-text`, `design-element`, `preview-text`, `preview-element` |
| `key` | `key` | p.ej. `"Control+c"`, `"Control+v"`, `"Control+z"` |
| `drag` | `target`, `dx`, `dy` | `anchorX/Y` opcionales, `steps` default 8 |
| `mode` | `mode` | `"preview"` o `"design"` |
| `zoom` | `value` | número (p.ej. `1.5`, `0.75`, `1.0`) |
| `wait` | `ms` | espera explícita |

### 3. Criterio de promoción

Una sesión debe cumplir **al menos uno**:
- Cubre un síntoma visual distinto a las sesiones existentes (ver tabla de sesiones)
- Añade una combinación nueva (p.ej. zoom + undo, drag + clipboard)
- Documenta un bug que no tiene regresión automatizada

Una sesión NO debe promocionarse si:
- Tiene fingerprint idéntico a otra sesión ya existente (el quality gate lo detecta)
- Solo varía `afterWaitMs` o textos de `target` sin cambiar la secuencia de acciones

### 4. Verificar antes de hacer merge

```sh
node --test tests/user_parity/session_replay_user_parity.test.mjs
```

Comprobar en el output:
- `SESSION QUALITY GATE: N sessions, no structural duplicates`
- `ok` en cada `session:tu-nueva-sesion`
- No hay `SCORE QUALITY WARNING` severo (si aparece, revisar si la sesión mide algo real)

---

## Cómo interpretar fallos

### Formato del error

Los fallos incluyen siempre el patrón:
```
<label>: <qué falló> — <datos concretos>
```

Ejemplos:
```
clipboard clones occlusion: critical occlusion detected [{"id":"e142","occlusionLevel":"total","occludedRatio":1,"topOccludingNodes":[...]}]
multiselect drag separation browser=chromium: visual collapse (>90% overlap) minGapPx=0 maxOverlapRatio=0.95 pairs=[...]
undo redo: frame drop detected {"jitterScore":0.5,"frameDropDetected":true,...}
session:full_undo_redo_cycle: design IDs must equal model IDs
```

### Por tipo de señal

| Señal | Qué significa cuando falla |
|---|---|
| `modelParity` / `designParity` | IDs en modelo ≠ IDs en DOM — el render no refleja el estado |
| `hitTesting` | `elementFromPoint` no alcanza el elemento — tapado por otra capa |
| `subtleOcclusion` | occludedRatio alto — elemento visible pero funcionalmente tapado |
| `cloneSeparation` | `collapseRisk=critical` — elementos casi totalmente superpuestos |
| `temporalStability` | overlay o IDs desaparecen en algún frame intermedio |
| `frameDropDetected` | el overlay se renderiza como nodo inexistente en algún frame |
| `jitterScore >= 0.02` | movimiento inesperado del overlay entre frames consecutivos |
| `visibleRatio < 0.35` | elemento recortado por clip ancestor > 65% de su área |

### Línea `PARITY SUMMARY`

Cada sesión emite al final:
```
PARITY SUMMARY: flow=X | browser=Y | minGapPx=Z | overlapRatio=W | confidence=N | labels=[...] | replaces="..."
```

El campo `replaces` dice qué check de QA manual cubre esa sesión.

### `SCORE QUALITY WARNING`

Aparece cuando la mayoría de dimensiones del confidence score son `stableSignal` (valor=1 sin medir nada real). No es un fallo — es un aviso de que el score puede ser artificialmente alto en ese test. Las sesiones de replay tienen esto esperado porque no miden todas las dimensiones.

### `UNSTABLE` en flaky detection

Si `flaky_detection_user_parity.test.mjs` emite `UNSTABLE`, significa que la misma operación produjo resultados distintos en dos iteraciones consecutivas. El test no falla por esto, pero es una señal de alerta para investigar timing.

---

## Tests actuales

| Archivo | Flow | Browsers | Señales principales |
|---|---|---|---|
| `clipboard_design_preview_parity.test.mjs` | clipboard paste/preview | chromium, firefox, webkit | parity, visibility, hit-testing, occlusion |
| `clipboard_visible_composition_user_parity.test.mjs` | clipboard visible | chromium, firefox, webkit | parity, occlusion, separation |
| `multiselect_drag_user_parity.test.mjs` | multiselect drag | chromium, firefox, webkit | overlay stability, jitter, occlusion |
| `multiselect_frame_glitch_user_parity.test.mjs` | multiselect glitch | chromium | overlay temporal (per-frame) |
| `undo_redo_user_parity.test.mjs` | undo/redo clipboard | chromium, firefox, webkit | parity, jitter, occlusion |
| `undo_redo_mixed_history_user_parity.test.mjs` | undo/redo mixed flows | chromium | rect restore, mode round-trip, multiselect undo |
| `preview_clipping_user_parity.test.mjs` | preview at zoom 2.0 | chromium | clipping, visibility |
| `selection_handle_stacking_user_parity.test.mjs` | handle hit-testing | chromium | stacking, handle occlusion |
| `visual_golden_user_parity.test.mjs` | visual goldens (workspace + micro-crops) | chromium, firefox, webkit | pixel diff, handle SE corner, clone intersection, cross-browser spread |
| `session_replay_user_parity.test.mjs` | corpus replay | chromium | parity + composition (all sessions) |
| `flaky_detection_user_parity.test.mjs` | overlay flaky check | chromium | jitter stability (2 iterations) |

## Sessions promovidas

| Sesión | Cubre | Labels |
|---|---|---|
| `clipboard_design_triple_paste` | paste×3 + mode switch preview | clipboard_flow, separation-risk, mode_switch |
| `drag_zoomed_overlay_composition` | drag a zoom 1.5 | drag_or_pointer_flow, zoom_composition, fine-composition |
| `triple_paste_undo_separation` | 3 pastes + 2 undos, separación tras undo parcial | clipboard_flow, undo_redo, separation-risk |
| `preview_interaction_design_parity` | preview round-trip: ¿corrompe composición? | clipboard_flow, mode_switch, fine-composition |
| `full_undo_redo_cycle` | ciclo completo undo/redo (3+3+3) | clipboard_flow, undo_redo, temporal-glitch |
| `zoom_transition_paste_composition` | paste a zoom 1.5 + transición de zoom | clipboard_flow, zoom_composition, fine-composition |
| `drag_then_undo_rect_restore` | paste + drag + undo drag + redo drag | drag_or_pointer_flow, undo_redo |
| `multiselect_zoom_undo_overlay` | paste a zoom 1.5 + undo: sin ghost elements | clipboard_flow, zoom_composition, undo_redo, fine-composition |
| `paste_drag_preview_round_trip` | paste + drag + round-trip preview/design | clipboard_flow, drag_or_pointer_flow, mode_switch, fine-composition |
| `four_paste_separation_stress` | 4 pastes sin undo: stress de separación | clipboard_flow, separation-risk, subtle-occlusion |
| `zoom_paste_undo_no_ghost` | paste a zoom + undo + zoom change: sin ghost | clipboard_flow, zoom_composition, undo_redo, fine-composition |

## Qué NO cubre (actualizado)

- Oclusión por `clip-path` no ortogonal o `transform` 3D
- Rendering diferencial real (pixel diff) — solo se miden posiciones y hit-testing
- Separación semántica (mismo texto visual en IDs distintos)
- Handles fuera del `se` en multi-selección simultánea
- Multiselect con Shift+click (no soportado en formato de sesión actual)
- Temporal drift intra-frame durante transiciones de zoom (solo estado final)
- Sesiones con elementos en posición extrema del canvas (fuera de viewport visible)
- Scores cross-browser para session replay (corre solo en chromium)
- Undo de múltiples operaciones encadenadas (paste+drag: la profundidad exacta del stack depende del runtime)

## Visual confidence score — pesos actuales

Recalibrado 2026-03-26 (final) con corpus de 11 sesiones, 3 browsers, 8 flows.
Cambios: heurística reducida -6pts → evidencia aumentada +6pts (total sigue 128).

| Dimensión | Peso | Tipo | Notas |
|---|---|---|---|
| modelParity | 14 | evidence | |
| designPreviewParity | 14 | evidence | |
| geometry | 10 | evidence | |
| visibility | 10 | evidence | |
| hitTesting | 10 | evidence | |
| temporalStability | **12** | evidence | ↑ desde 10; señal más discriminante para undo/redo |
| subtleOcclusion | **12** | evidence | ↑ desde 10; señal principal de fine composition |
| clipping | 8 | evidence | |
| stacking | 8 | evidence | |
| compositorDivergence | **8** | evidence | ↑ desde 7; base de evidencia cross-browser ampliada |
| crossBrowserStability | **7** | evidence | ↑ desde 6; 11 sesiones confirman estabilidad |
| interactionUsability | **6** | heuristic | ↓ desde 8; siempre verde en corpus, no discrimina |
| legibility | **5** | evidence | ↓ desde 7; nunca discrimina en configuraciones medidas |
| overlapCollision | **4** | heuristic | ↓ desde 6; overlap esperado en paste flows, ruido |

## Capas de código

- `helpers.mjs`: collectors, signals, assertions de composición
- `reporting.mjs`: `formatFlowSummary`, `computeFlakinessBand`, `assessScoreQuality`, coverage matrix
- `session_tools.mjs`: record/replay/label/fingerprint/duplicate detection
- `sessions/`: corpus de sesiones promovidas (`.session.json`)
- `*_user_parity.test.mjs`: regresiones permanentes por flujo real

## Session pipeline

```
record → auto-label → quality gate (fingerprint + duplicates) → replay → assert parity + composition → PARITY SUMMARY
```
