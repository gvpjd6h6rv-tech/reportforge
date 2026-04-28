# Snap Engine Contract — FACADE REMOVED (2026-04-25)

`SnapEngine.js` has been deleted. Callers now import the owner modules directly.

## Owners

- `SnapState.js` — grid size and enabled state (`init`, `setEnabled`, `toggle`, `isEnabled`, `setGrid`, `getGrid`)
- `SnapCore.js` — pure snap math (`snapValue`, `snapPoint`, `snapFromClient`)
- `SnapGuides.js` — alignment-guide candidate lookup (`getAlignmentGuides`)

## Migration

| Was | Now |
|---|---|
| `SnapEngine.init()` | `SnapState.init()` |
| `SnapEngine.snap(v)` | `SnapCore.snapValue(v, SnapState.getGrid(), SnapState.isEnabled())` |
| `SnapEngine.snapPoint(x, y)` | `SnapCore.snapPoint(x, y, SnapState.getGrid(), SnapState.isEnabled())` |
| `SnapEngine.snapFromClient(cx, cy)` | `SnapCore.snapFromClient(cx, cy, SnapState.getGrid(), SnapState.isEnabled())` |
| `SnapEngine.getAlignmentGuides(el, t)` | `SnapGuides.getAlignmentGuides(el, t)` |
| `SnapEngine.toggle()` | `SnapState.toggle()` |
| `SnapEngine.isEnabled()` | `SnapState.isEnabled()` |
| `SnapEngine.setEnabled(v)` | `SnapState.setEnabled(v)` |
| `SnapEngine.setGrid(g)` | `SnapState.setGrid(g)` |
| `SnapEngine.getGrid()` | `SnapState.getGrid()` |
| `DS.snap(v)` shim | stays in `RuntimeBootstrap.js` via `SnapCore.snapValue` directly |

## Invariants (unchanged)

- Snap math always happens in model space.
- Snap state has a single owner (`SnapState`).
- Snap guide lookup is read-only and does not mutate DS.
- `DS.snap` compatibility shim remains in `RuntimeBootstrap.js`.
