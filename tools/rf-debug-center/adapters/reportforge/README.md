# RF Debug Center — ReportForge Adapter v1

This adapter implements the canonical adapter contract for the ReportForge project.

## Files

- `reportforge-adapter.js` — adapter implementation (≤160 lines)
- `reportforge-adapter-metadata.js` — static metadata: selectors, paths, flags (≤100 lines)

## Contract compliance

`validateReportforgeAdapter()` verifies that this adapter satisfies `ADAPTER_CONTRACT`.

```js
import { validateReportforgeAdapter } from './reportforge-adapter.js';
const { valid, errors } = validateReportforgeAdapter();
```

## What this adapter knows about ReportForge

- Trace source: `window.RF_UI_TRACE`
- Single global: `window.RFDebugCenter`
- Activation: `?rfDebugCenter=1`, `localStorage:RF_DEBUG_CENTER`, `window.RF_DEBUG_TRACE`
- DOM selectors: `#canvas-layer`, `#preview-layer`, `#preview-content`, `#zw-slider`, `#zw-pct`, `#tb-zoom`, `#workspace`
- Network paths: `/designer-preview`, `/render`, `/rf-audit`, `/export/pdf`

## What this adapter does NOT do

- Does not mutate `RF_UI_TRACE`
- Does not mutate `DS`
- Does not move DOM nodes
- Does not trigger render or preview
- Does not make external network requests
- Does not create new globals

## Wiring

Wiring of `reportforgeAdapter` into the debug center store and API is deferred to PORT1.
In PORT0 the adapter exists and validates correctly but is not yet wired into the runtime.
