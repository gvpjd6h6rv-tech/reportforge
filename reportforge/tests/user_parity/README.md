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
