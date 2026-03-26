# User Parity Suite

Objetivo: reproducir síntomas visibles reales del usuario y comparar automáticamente:

- modelo (`DS.elements`)
- render en Diseño (`.cr-element:not(.pv-el)`)
- render en Preview (`#preview-content .pv-el`)
- síntoma visual observable (`sel-box`, clones visibles, overlay)

Reglas:

1. Un bug de UI no queda cerrado sin regresión automática del síntoma visible.
2. Pasar invariants internas no basta si el síntoma humano no queda cubierto.
3. Si smoke manual falla, el bug sigue abierto aunque esta suite pase.
4. La prioridad es paridad observable, no detalles internos aislados.

Capas:

- `helpers.mjs`: helpers de user-flow + paridad + snapshots temporales
- helpers de composición visible: bbox real, hit-testing, clipping, frame snapshots
- `*_user_parity.test.mjs`: regresiones permanentes por flujo real
- `reporting.mjs`: score de flujo, score de entorno y matriz de cobertura por navegador
- `session_tools.mjs`: base de record/replay/promoción desde sesiones reales

Browsers:

- distinguir siempre:
  - browser detectado en sistema
  - browser usable por Playwright
  - browser realmente ejecutado en la suite
  - browser bloqueado por config/binario
- no reclamar cobertura cross-browser si el engine no fue ejercitado

Promotion policy:

Cada test nuevo debe declarar o implicar:

- qué bug histórico o riesgo cubre
- qué capa añade:
  - parity
  - geometry
  - clipping
  - stacking
  - temporal
  - visual diff
- qué parte del smoke manual reemplaza
- qué límites mantiene

Session pipeline:

1. `record`
2. `auto-label`
3. `minimize/promote`
4. `replay`
5. `assert parity + visual confidence`

Tests actuales:

- `clipboard_design_preview_parity.test.mjs`
- `clipboard_visible_composition_user_parity.test.mjs`
- `selection_handle_stacking_user_parity.test.mjs`
- `preview_clipping_user_parity.test.mjs`
- `multiselect_frame_glitch_user_parity.test.mjs`
- `multiselect_drag_user_parity.test.mjs`
- `undo_redo_user_parity.test.mjs`
- `session_replay_user_parity.test.mjs` (loops all sessions en `sessions/`)

Sessions promovidas:

| Sesión | Cubre | Labels |
|---|---|---|
| `clipboard_design_triple_paste` | paste×3 + mode switch preview | clipboard_flow, separation-risk, mode_switch |
| `drag_zoomed_overlay_composition` | drag a zoom 1.5 | drag_or_pointer_flow, zoom_composition, fine-composition |
| `triple_paste_undo_separation` | 3 pastes + 2 undos, separación tras undo parcial | clipboard_flow, undo_redo, separation-risk |
| `preview_interaction_design_parity` | preview round-trip: ¿corrompe composición? | clipboard_flow, mode_switch, fine-composition |
| `full_undo_redo_cycle` | ciclo completo undo/redo (3+3+3) | clipboard_flow, undo_redo, temporal-glitch |
| `zoom_transition_paste_composition` | paste a zoom 1.5 + transición de zoom | clipboard_flow, zoom_composition, fine-composition |

Visual confidence score — pesos actuales (recalibrado 2026-03-26):

| Dimensión | Peso | Tipo |
|---|---|---|
| modelParity | 14 | evidence |
| designPreviewParity | 14 | evidence |
| geometry | 10 | evidence |
| visibility | 10 | evidence |
| hitTesting | 10 | evidence |
| temporalStability | 10 | evidence |
| subtleOcclusion | **10** | evidence (↑ desde 7; ahora 9 puntos de muestreo) |
| clipping | 8 | evidence |
| stacking | 8 | evidence |
| interactionUsability | 8 | heuristic |
| legibility | **7** | evidence (↓ desde 8; no discrimina en corpus actual) |
| compositorDivergence | **7** | **evidence** (↑ desde 5 heurístico; 3 browsers medidos) |
| overlapCollision | **6** | heuristic (↓ desde 8; overlap esperado en paste flows) |
| crossBrowserStability | **6** | **evidence** (↑ desde 4 heurístico; ID sets estables en 3 browsers) |
