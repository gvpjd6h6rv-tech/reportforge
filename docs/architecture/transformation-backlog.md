# Transformation Backlog

| ID | Título | Problema | Archivos | Riesgo | Impacto | Prioridad | Criterio de done |
|---|---|---|---|---|---|---|---|
| RF-ARCH-001 | Lock canonical runtime | `/` still serves monolith without explicit policy | `reportforge_server.py`, `run.sh`, docs | medio | crítico | P0 | one documented canonical runtime and frozen alternates |
| RF-ARCH-002 | Remove selection bridge ambiguity | `SelectionEngine <- SelectionEngineV19.bind` hides real owner | `designer/crystal-reports-designer-v4.html`, `engines/SelectionEngine.js` | alto | crítico | P0 | one selection owner, no runtime patch bridge |
| RF-ARCH-003 | Normalize `elementRect` contract | geometry shape ambiguity already caused runtime bug | `designer/crystal-reports-designer-v4.html`, `engines/SelectionEngine.js`, geometry docs/tests | alto | crítico | P0 | one shape only, covered by contract tests |
| RF-ARCH-004 | Eliminate duplicate canvas writers | monolith canvas path and `CanvasLayoutEngine` coexist | `designer/crystal-reports-designer-v4.html`, `engines/CanvasLayoutEngine.js` | alto | crítico | P0 | one canvas DOM writer |
| RF-ARCH-005 | Enforce scheduler-only DOM writes | runtime still uses direct sync and direct writes | `engines/RenderScheduler.js`, `engines/EngineCore.js`, monolith hooks | alto | crítico | P0 | invariant/test fails on out-of-band DOM writes |
| RF-ARCH-006 | Collapse dual history systems | `DS.history` and `HistoryEngine` both exist | monolith, `engines/HistoryEngine.js` | medio | alto | P1 | one history stack, one undo/redo path |
| RF-ARCH-007 | Remove DOM aliases | `.rf-el` and legacy IDs keep duplicate DOM contract alive | monolith, QA scripts | medio | alto | P1 | no runtime alias injection remains |
| RF-ARCH-008 | Normalize zoom ownership | `DesignZoomEngine` and `ZoomEngineV19` both own flow | monolith, `engines/ZoomEngine.js`, geometry consumers | alto | alto | P1 | one zoom writer and one read API |
| RF-ARCH-009 | Collapse preview dual path | preview helpers duplicated between monolith and engine | monolith, `engines/PreviewEngine.js` | medio | alto | P1 | one preview render path |
| RF-ARCH-010 | Replace browserless smoke with runtime suite | current smoke does not govern live v4 runtime | `reportforge/tests/test_ui_smoke.py`, visual/geometry scripts | bajo | alto | P1 | browser-based suite gates canonical runtime |
| RF-ARCH-011 | Define canonical DOM contract | `.cr-element` vs `.rf-el`, `#handles-layer` vs `#sel-layer` | monolith, modular runtime, docs | medio | alto | P1 | one DOM contract document and one live implementation |
| RF-ARCH-012 | Move presentation out of inline JS | runtime visual behavior still depends on inline style generation | monolith, engines CSS/JS | medio | medio | P2 | presentation styles live in CSS, geometry inline minimized |
| RF-ARCH-013 | Remove v3 fallback | v3 fallback extends compatibility budget | `reportforge_server.py`, deployment docs | bajo | medio | P2 | no v3 runtime path in server |
| RF-ARCH-014 | Harden invariants for ownership | invariants exist but do not catch duplicate owners | `engines/EngineCore.js`, `engines/RenderScheduler.js` | medio | medio | P2 | invariants fail on duplicate owner conditions |
| RF-ARCH-015 | Freeze modular runtime or promote it deliberately | modular runtime exists but is not governed | `reportforge/designer/*`, server routing, docs | medio | alto | P2 | explicit decision: remove, freeze, or promote |
