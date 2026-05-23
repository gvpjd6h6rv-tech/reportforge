# RF Debug Center — SAP B1 Linux Adapter v1

Read-only adapter for the sap_b1_linux invoicing system.

## Purpose

Exposes sap_b1_linux runtime state, traces, DOM, and network config to RF Debug Center without mutating any application state.

## Files

- `sap-b1-linux-adapter.js` — adapter implementation (≤160 lines)
- `sap-b1-linux-adapter-metadata.js` — static metadata: UDF fields, DOM selectors, network paths, ownership map (≤100 lines)

## Read-only sources

| Source | API | Purpose |
|---|---|---|
| `window.__CAUSAL_LOG__` | `.getAll()` | Timeline of state writes and events |
| `window.DocumentModel` | read-only access | Current document state (DocEntry, CardCode, udf.*) |
| `window.Facade._state` | `Facade.getState()` | Infrastructure flags (writeBlocked, readyForWrites) |
| `document.querySelector('[data-udf=...]')` | read value | Current visible UDF field values |
| `document-model:changed` | addEventListener | Model change timeline (future SAP2) |

## UDF transporte/transportista

Fields covered:

| Campo | Tipo | Fuente |
|---|---|---|
| `U_TRANSPORTE` | padre | dropdown — código empresa transporte |
| `U_TRANSPORTISTA` | padre | dropdown — código conductor |
| `U_GUIA_TRANSPORTE_PLACA` | hijo auto | rellenado backend desde @EXXIS_TRANSPORTE |
| `U_TRANSPORTE_DESC` | hijo auto | nombre empresa transporte |
| `U_GUIA_TRANSPORTISTA_NOMBRE` | hijo auto | nombre conductor |
| `U_GUIA_TRANSPORTISTA_RUC` | hijo auto | RUC conductor |

Children are auto-filled by the backend enrichment in `document_snapshot_core.py:_enrich_transporte()` and `_enrich_transportista()`.

## DOM targets

```
#fe-fields-container           UDF panel root
[data-udf="U_TRANSPORTE"]      transport company dropdown
[data-udf="U_TRANSPORTISTA"]   driver dropdown
[data-udf="U_GUIA_TRANSPORTE_PLACA"]    plate (auto)
[data-udf="U_GUIA_TRANSPORTISTA_NOMBRE"] driver name (auto)
[data-udf="U_GUIA_TRANSPORTISTA_RUC"]   driver RUC (auto)
[data-bind="DocNum"]           invoice number
#btnCreate, #btnFind, #mainTable
```

## Network paths observed

```
/api/document/       load & save invoice (enriches transport fields)
/api/vcr_nav         VCR navigation — risk of stale UDF state
/advanced_search     search — risk of dirty UDF on 0 results
/create_order        order creation
/api/udf/schema/     UDF field schema
/api/udf/catalog/    transport/driver catalog data
/api/udf/valid-values/
```

## Ownership map (SAP0)

| Subsystem | Owner | Key invariant |
|---|---|---|
| DocumentModel | `documentModel.js` | SSOT, emits `document-model:changed` |
| GuideContract | `guideContract.js` | read-only |
| UdfFe | `udf_fe.js` | sole owner of `#fe-fields-container` |
| BindingsDom | `bindings_dom.js` | sole owner of `[data-bind]` renders |
| Network | `http.js` | all calls via `Facade.safeFetch` |
| DocumentSnapshotCore | `document_snapshot_core.py` | enriches transport before responding |

## Bug objetivo futuro (SAP2+)

1. **Stale UDF in VCR navigation** — UDF fields from previous document survive in model when navigating via `/api/vcr_nav` if `setDocumentModel` payload is partial (`document_snapshot_core.py:156-159`)
2. **Missing UDF reset on 0-result search** — `findMode.js` does not call `setDocumentModel` on empty results; UDF panel keeps previous values
3. **Transport child hydration gap** — Backend enrichment conditional on `DLV_U_TRANSPORTE` presence; if OINV has stale code and ODLN has new code, OINV wins (`document_snapshot_core.py:156-159`)

## What SAP1 does NOT do

- Does NOT patch UDF hydration bug
- Does NOT mutate DocumentModel
- Does NOT mutate `__CAUSAL_LOG__`
- Does NOT call `safeFetch` or intercept network
- Does NOT move DOM nodes
- Does NOT install event listeners
- Does NOT register globals

## Activation flags (future — NOT active yet)

```
?sapDebugCenter=1
window.__SAP_DEBUG_CENTER__ === true
localStorage.SAP_DEBUG_CENTER = "1"
```

Activation and runtime bridge are deferred to SAP2.

## SAP2 — How the bridge captures evidence (LISTO)

The bridge is installed in `sap_b1_linux/static/js/debug/`:

- `sap_debug_center_bridge.js` — orchestrator, sets `window.SAPDebugCenter`
- `sap_debug_center_capture.js` — snapshot and findings engine (pure functions)
- `sap_debug_center_panel.js` — minimal floating panel UI

Activated only by flag: `?sapDebugCenter=1`, `window.__SAP_DEBUG_CENTER__`, or `localStorage.SAP_DEBUG_CENTER = "1"`.

Findings captured per `document-model:changed`:

- `UDF_PARENT_WITH_EMPTY_CHILD` — padre con valor, hijos vacíos
- `TRANSPORTE_CHILDREN_INCOMPLETE` — U_TRANSPORTE sin placa/desc
- `TRANSPORTISTA_CHILDREN_INCOMPLETE` — U_TRANSPORTISTA sin nombre/RUC
- `UDF_MODEL_DOM_MISMATCH` — model value ≠ DOM visible
- `UDF_CHILD_STALE_AFTER_DOC_CHANGE` — hijo conserva valor del documento anterior
- `CREATE_MODE_DIRTY_UDF` — modo crear con UDF DOM sucio
- `FIND_MODE_DIRTY_UDF` — modo buscar con UDF DOM sucio

API: `window.SAPDebugCenter.{getState, refresh, clear, buildBundle, copyBundleJSON, stop}`

## Contract compliance

```js
import { validateSapB1LinuxAdapter } from './sap-b1-linux-adapter.js';
const { valid, errors } = validateSapB1LinuxAdapter(); // → { valid: true, errors: [] }
```
