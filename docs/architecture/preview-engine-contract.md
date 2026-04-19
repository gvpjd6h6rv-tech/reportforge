# Preview Engine Contract

`PreviewEngineV19` is a facade only.

## Owners

- `PreviewEngineContracts.js`: preview DOM and contract assertions.
- `PreviewEngineData.js`: resolver/data path and HTML generation.
- `PreviewEngineMode.js`: preview mode toggling and chrome state.
- `PreviewEngineRenderer.js`: preview refresh and DOM write path.
- `PreviewEngine.js`: public facade and export surface.

## Public API

- `PreviewEngineV19.show()`
- `PreviewEngineV19.hide()`
- `PreviewEngineV19.toggle()`
- `PreviewEngineV19.refresh()`
- `PreviewEngineV19.isActive()`
- `PreviewEngineV19.getMetrics()`
- `PreviewEngineV19._renderWithData()`
- `PreviewEngineV19._renderBand()`
- `PreviewEngineV19._renderSectionData()`
- `PreviewEngineV19._renderElementData()`
- `PreviewEngineV19._renderInstanceElement()`
