# History Engine Contract

- `HistoryEngine.js` is facade-only.
- `HistoryState.js` owns undo/redo stacks, listeners, suppression, and stack summaries.
- `HistorySnapshot.js` owns snapshot capture and restore into the runtime update path.
- `HistoryLegacyBridge.js` has been eliminated. `HistoryEngine` now calls `DS.saveHistory`, `DS.undo`, and `DS.redo` inline with typeof guards.
- The facade must not reintroduce snapshot capture, restore mechanics, or a bridge object.
