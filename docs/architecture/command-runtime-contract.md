# Command Runtime Contract

`CommandRuntime.js` is the facade only.

## Owners

- `CommandRuntimeShared.js`: shared status and UI refresh helpers.
- `CommandRuntimeSelection.js`: selection, alignment, z-order, grouping, clipboard actions.
- `CommandRuntimeView.js`: zoom-fit and guide helpers.
- `CommandRuntimeSections.js`: section lifecycle and section-level write actions.
- `CommandRuntimeFile.js`: save/load/export/import.
- `CommandRuntimeDocType.js`: doc type switching and sample data wiring.
- `CommandRuntimeHandlers.js`: public action/view/format handlers.
- `CommandRuntimeInit.js`: runtime boot state and save-history hook.

## Public Facade

- `CommandEngine`
- `FileEngine`
- `handleAction`
- `switchDocType`
- `handleToolSelection`
- `handleViewSelection`
- `handleZoomSelection`
- `handleFormatAction`
- `handleFontFamilyChange`
- `handleFontSizeChange`
- `initCommandRuntimeState`
