# Bridges and Shims

## Active Bridges / Compatibility Layers

| Nombre | Dónde está | Qué conecta | Por qué existe | ¿Sigue siendo necesario hoy? | Riesgo de removerlo | Prioridad | Rollback path |
|---|---|---|---|---|---|---|---|
| Legacy canvas patch bridge (removed) | runtime boot | facade legacy -> `CanvasLayoutEngine` | mantener API legacy viva | no | alto | cerrado | n/a — already removed |
| Alternate selection patch bridge (removed) | runtime boot | engine alterno -> `SelectionEngine` | compat de eventos y API | no | crítico | cerrado | n/a — already removed |
| Legacy preview patch bridge (removed) | runtime boot | facade legacy -> `PreviewEngineV19` | mantener tabs/preview sin rewire completo | no | alto | cerrado | n/a — already removed |
| DesignZoomEngine patch wrapper phase 2 | engines/DeferredBootstrap.js, engines/RuntimeBootstrap.js | zoom legacy -> scheduler handles tier | batching parcial | no | alto | P0 | Remove guard flag `_rfPhase2ZoomPatched`; restore unwrapped `DesignZoomEngine._apply` |
| DesignZoomEngine patch wrapper phase 3 | engines/DeferredBootstrap.js | zoom legacy -> layout/visual scheduler tiers | batching parcial | no | alto | P0 | Remove guard flag `_rfPhase3Patched`; restore unwrapped `DesignZoomEngine._apply` |
| DS.saveHistory patch | engines/DeferredBootstrap.js | `DS.saveHistory` -> `HistoryEngine` sync expectations | coexistencia doble history | no | medio | P1 | Remove guard flag `_rfPhase3Patched` on DS.saveHistory; let HistoryEngine own save directly |
| Snap compatibility shim | engines/SnapCore.js / SnapState.js | legacy `DS.snap()` callers -> new snap engine semantics | compat con código legacy | probablemente temporal | medio | P1 | Delete `DS.snap` assignment in RuntimeBootstrap; update all `DS.snap(v)` callsites to `SnapCore/SnapState.snap(v)` |
| DOM alias injector (removed) | runtime boot | duplicate element contract | compat con suites/repos externos | no | alto | cerrado | n/a — already removed |
| Legacy ID alias injector | engines/RuntimeBootstrap.js | real DOM ids -> ids esperados por QA | compat externa | no | alto | P1 | Remove alias creation block; update QA selectors to use canonical IDs |
| v4/v3 runtime fallback | reportforge/server/main.py | v4 preferred -> v3 fallback | resiliencia histórica | solo si v4 no existe | bajo técnico, alto arquitectónico | P2 | Remove fallback import; assert v4 is always present in deployment |
| `HandlesEngine.render -> SelectionEngine.renderHandles` | engines/HandlesEngine.js | declarative handles engine -> actual selection overlay writer | v19 facade with existing code | temporal | medio | P1 | Implement full handle rendering in HandlesEngine; remove SelectionEngine.renderHandles delegation |
| ZoomEngineV19.set wrapper | engines/DeferredBootstrap.js | ZoomEngineV19.set -> observability hook | trace integration | no | bajo | P1 | Remove wrapper; add trace call directly to ZoomEngineV19.set |

## Removal Guidance

- Remove bridges only after contract normalization.
- Remove DOM aliases before declaring any DOM contract done.
- Remove zoom wrappers only after one zoom engine owns the full pipeline.
- Each P0 bridge removal requires: (1) remove the idempotency guard flag, (2) verify reload_storm_guard still passes, (3) run full test suite.
- Each P1 bridge removal requires: (1) update one or two callsites, (2) verify the owning engine's tests pass, (3) delete the shim.

## Safe Rollback Contract

All active bridges (P0/P1/P2) must satisfy:

1. **Idempotency-guarded** — re-applying the bridge on a second DOMContentLoaded does not stack wrappers (verified by `audit/reload_storm_guard.mjs`).
2. **Rollback path documented** — the "Rollback path" column above describes the exact steps to remove the bridge with no service interruption.
3. **No silent removal** — bridges marked "cerrado" must be absent from all boot files; the guard `audit/safe_rollback_guard.mjs` enforces this statically.
