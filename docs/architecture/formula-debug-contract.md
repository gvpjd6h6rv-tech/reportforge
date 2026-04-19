# Formula and Debug Contract

## Ownership

- `FormulaEngine.js` owns formula parsing, validation, and evaluation.
- `FormulaEditorDialog.js` owns the formula editor modal UI.
- `DesignerUI.js` owns classic/modern mode toggling.
- `DebugTrace.js` owns debug state, presets, localStorage, and `rfTrace`.
- `DebugPanelUtils.js` owns shared debug panel helpers.
- `DebugChannelsPanel.js` owns the debug channels panel DOM.
- `DebugTraceToggle.js` owns the indicator, console gate, and activation flow.
- `DebugOverlay.js` owns the runtime overlay DOM.
- `FormulaAndDebug.js` is facade-only and must stay minimal.

## Invariants

- Formula logic does not mix with debug UI.
- Debug state does not own formula parsing or editing.
- `FormulaEngine` is the only public formula runtime owner.
- `DebugTrace` is the only owner of debug state.
- `FormulaEditorDialog` never mutates global debug state.
- `DebugOverlay` never parses formulas or mutates the document model.
- `FormulaAndDebug.js` remains a compatibility facade only.
