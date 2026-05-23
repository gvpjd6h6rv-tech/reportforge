# RF Debug Center

RF Debug Center is a sidecar debugging tool for ReportForge.

## Current Implementation

This repository currently contains **ReportForge Adapter v1**.

- source of truth for runtime observation: `window.RF_UI_TRACE`
- single public global: `window.RFDebugCenter`
- mounted only by explicit dev/debug flags

## Strategic Roadmap

This sidecar already has a hardened base. The next permanent step is the
**E1 strategic amendment**: keep the core generic while preparing the tool to
grow into six dedicated observability engines without coupling the core to
ReportForge internals.

Roadmap:

- `H1` - hardening sidecar base, already `LISTO`
- `E1` - strategic amendment for six bug classes
- `T1` - timeline for `RF_UI_TRACE`
- `Z1` - zoom diagnostics
- `D1` - DOM / visual engine
- `B1` - debug bundle export
- `W1` - live warnings
- `L1` - loop and freeze engine
- `P1` - performance engine
- `A1` - async / race engine
- `N1` - network / backend engine
- `S1` - selection / drag / resize engine
- `R1` - render / preview engine, `LISTO`
- `V1` - visual evidence / screenshots, `LISTO`
- `F1` - final hardening, `LISTO`
- `PORT0` - adapter boundary / core contract, `LISTO`
- `SAP0` - discovery sap_b1_linux architecture, `LISTO`
- `SAP1` - adapter mínimo sap_b1_linux read-only, `LISTO`
- `SAP2` - runtime bridge sap_b1_linux instalación controlada, `LISTO`

Backlog notes:

- `Z2` - DOM scanner adversarial sandbox, `NOT READY` until browser validation is completed. Keep it out of the real repo until that validation passes.

Planned engine families:

- `Loop & Freeze Engine`
- `Performance Engine`
- `Async/Race Engine`
- `State & Ownership Engine`
- `Network/Backend Engine`
- `DOM/Visual Engine`

## T1 Timeline

The current Timeline is the first production-grade observability surface built on
top of `RF_UI_TRACE`.

It must stay read-only with respect to `RF_UI_TRACE` and maintain its own
internal buffer.

Timeline states:

- `present`
- `empty`
- `absent`
- `invalid`

Public timeline actions:

- `pauseTimeline()`
- `resumeTimeline()`
- `clearTimeline()`
- `refreshTimeline()`
- `copyTimelineJSON()`

The internal snapshot exposes:

- total event count
- severity counts
- last event
- recent events
- last sync time
- source status

The Timeline is still a sidecar concern. It must not mutate ReportForge state
or replace `window.RF_UI_TRACE`.

## Z1 Zoom Diagnostics

`Z1` turns the zoom signal into a structured diagnosis surface built from:

- `DS.zoom`, `DS.zoomDesign`, `DS.zoomPreview`
- the visible zoom controls: `#zw-slider`, `#zw-pct`, `#tb-zoom`
- the real DOM target and its transform/scale
- the last zoom-related `RF_UI_TRACE` event

The diagnostic classifies the live state as:

- `synced`
- `warning`
- `error`
- `unknown`

It is read-only and does not correct zoom. The main goal is to expose
divergences such as:

- slider updated, percent frozen
- percent updated, slider frozen
- DOM scale not matching the visible controls
- Preview zoom events sourced through the wrong handler
- slider step incompatible with the effective zoom

Public Z1 contract:

- `buildZoomDiagnostics()`
- `state.zoom` inside the sidecar snapshot

## B1 Debug Bundle Export

`B1` exports a portable JSON bundle for humans and tools. The bundle is built
from the current sidecar snapshot and is read-only with respect to ReportForge.

Public bundle actions:

- `buildBundle()`
- `exportBundle()`
- `copyBundleJSON()`

Bundle contents include:

- metadata and environment
- session state
- timeline snapshot
- zoom diagnostics
- DOM / visual snapshot
- ownership map
- governance/roadmap summary
- redacted evidence trace

The bundle is sanitized before export:

- sensitive keys are redacted
- long strings are truncated
- large arrays are capped
- circular references are normalized

Bundle filenames use the pattern:

- `rf-debug-bundle-YYYYMMDD-HHMMSS.json`

## W1 Live Warnings

`W1` turns the current evidence surfaces into compact, deduplicated warnings.
It is still read-only and does not mutate `RF_UI_TRACE`, `DS`, or the bundle
sources.

Public warnings actions:

- `refreshWarnings()`
- `clearWarnings()`
- `copyWarningsJSON()`

Warnings are evidence-driven. A warning only appears when a rule can cite
existing snapshots from:

- Timeline
- Zoom Diagnostics
- DOM / visual diagnostics
- Bundle state
- Ownership map
- `RF_UI_TRACE` status

The initial rule set includes:

- `RF_UI_TRACE_ABSENT`
- `RF_UI_TRACE_INVALID`
- `TIMELINE_EMPTY_WHILE_ACTIVE`
- `ZOOM_DIVERGENCE`
- `DOM_DIVERGENCE`
- `OWNERSHIP_MAP_MISSING`
- `BUNDLE_EXPORT_ERROR`
- `SOURCE_PAUSED`

Warnings carry:

- `ruleId`
- `severity`
- `title`
- `message`
- `evidence`
- `suggestedOwner`
- `status`

The warnings panel deduplicates by fingerprint and keeps the evidence compact.
`clearWarnings()` only clears the sidecar's internal warning snapshot; it does
not clear `RF_UI_TRACE`.

## L1 Loop & Freeze Engine

`L1` analyzes the existing timeline snapshot for loop, storm, and freeze-risk
signals. It stays read-only and never installs invasive listeners or mutates
`RF_UI_TRACE`, `DS`, or the DOM.

Public loop-freeze actions:

- `refreshLoopFreeze()`
- `clearLoopFreeze()`
- `copyLoopFreezeJSON()`

The loop-freeze snapshot is derived from:

- timeline entries and timestamps
- `RF_UI_TRACE` source state
- last known activity
- bundle and warnings context when available

The initial rule set includes:

- `EVENT_STORM`
- `REPEATED_HANDLER`
- `POSSIBLE_LOOP_PATTERN`
- `HEARTBEAT_GAP`

## A1 Async / Race Engine

`A1` analyzes the timeline for async order problems using `transactionId`,
`requestId`, `renderId`, `stateRevision`, `mode`, and document identifiers when
they exist. It is read-only and does not intercept fetch or mutate runtime
state.

Public async-race actions:

- `refreshAsyncRace()`
- `clearAsyncRace()`
- `copyAsyncRaceJSON()`

The initial rule set includes:

- `OUT_OF_ORDER_RESPONSE`
- `STALE_WRITE_AFTER_MODE_CHANGE`
- `RENDER_AFTER_NEWER_RENDER`
- `STATE_REVISION_REGRESSION`
- `LATE_ASYNC_ERROR`
- `MISSING_END_EVENT`
- `DUPLICATE_ACTIVE_TRANSACTION`
- `TIMELINE_GROWTH_SPIKE`

The snapshot reports:

- `status`
- `heartbeat`
- `eventStorms`
- `repeatedHandlers`
- `possibleLoops`
- `lastEvents`
- `risk`
- `evidence`
- `suggestedOwner`

`clearLoopFreeze()` only clears the sidecar's internal loop-freeze snapshot; it
does not clear `RF_UI_TRACE` or the timeline source.

## N1 Network / Backend Engine

`N1` observes fetch/XHR only while the sidecar is active. It is passthrough
only: request arguments, headers, payloads, responses, blobs, and PDFs are not
modified. When a body or response is safe to summarize, the engine stores a
redacted snapshot; otherwise it records metadata only.

The implementation is split between:

- `rf-debug-center-network-core.js` for snapshot/state assembly
- `rf-debug-center-network.js` for fetch/XHR installation and passthrough

Public network actions:

- `refreshNetwork()`
- `clearNetwork()`
- `copyNetworkJSON()`
- `state.network` inside the sidecar snapshot

Captured network evidence includes:

- requestId / transactionId
- method, sanitized URL path, and query keys
- status, ok flag, content type, and duration
- safe request / response summaries
- slow, failed, or leaked requests
- redaction markers for sensitive fields

The initial warning signals can be derived from:

- failed requests
- slow requests
- active request leaks
- applied redactions
- observer-disabled / partial observer state

## P1 Performance Engine

`P1` measures the runtime cost of what the sidecar already observes. It does
not monkey-patch application handlers or timers. Instead it samples the
existing evidence surfaces and optional browser performance hooks when the side
bar is active.

Public performance actions:

- `refreshPerformance()`
- `clearPerformance()`
- `copyPerformanceJSON()`
- `state.performance` inside the sidecar snapshot

The performance snapshot combines:

- event duration from the Timeline
- event rate over a 5s window
- slow or leaking network requests
- long tasks from `PerformanceObserver` when available
- frame gaps from `requestAnimationFrame` when available
- correlations from `Loop & Freeze` and `Async/Race`

Initial thresholds:

- slow event: `>= 100ms`
- slow request: `>= 1000ms`
- frame gap: `>= 250ms`
- long task: `>= 50ms`
- event rate: `> 12 events/sec` within the sample window

The snapshot stays read-only and is capped so it can be exported safely in the
debug bundle without turning the sidecar into a profiler.

## S1 Selection / Drag / Resize Engine

`S1` inspects the current selection and the visible selection overlay without
changing selection state, dragging, resizing, or DOM layout. It compares the
selected model element against the rendered selection box, handles, guides, and
section bounds when those signals exist.

Public selection actions:

- `refreshSelection()`
- `clearSelection()`
- `copySelectionJSON()`
- `state.selection` inside the sidecar snapshot

The selection snapshot is read-only and can report:

- selected ids, element id, and element type
- selection box / handles / guides visibility
- selected DOM rect and overlay rect
- drag and resize before/after evidence from the timeline
- section bounds and out-of-section drift
- visibility and hit-test clues for the selected element

The initial findings include:

- `SELECTED_ELEMENT_MISSING`
- `SELECTION_BOX_MISSING`
- `HANDLES_MISSING`
- `MODEL_DOM_POSITION_DRIFT`
- `MODEL_DOM_SIZE_DRIFT`
- `ELEMENT_OUT_OF_SECTION`
- `SELECTED_ELEMENT_HIDDEN`
- `DRAG_WITHOUT_MODEL_UPDATE`
- `RESIZE_WITHOUT_DOM_UPDATE`

## R1 Render / Preview Engine

`R1` inspects the preview lifecycle and preview DOM without calling
`PreviewEngineRenderer` or changing preview state. It correlates the preview
surface with safe network, performance, and async evidence already collected by
the sidecar.

Public render/preview actions:

- `refreshRenderPreview()`
- `clearRenderPreview()`
- `copyRenderPreviewJSON()`

The render/preview snapshot can report:

- preview mode / lifecycle
- preview root, content, page count, visibility, transform, and scale
- preview / render / audit / export request summaries
- out-of-order render and missing-end evidence from `A1`
- slow render and long-task correlations from `P1`
- preview DOM emptiness or design-canvas leakage when evidence exists

## Design Goal

The tool should stay portable across repos without hard-coding ReportForge internals into the core.

Target separation:

- `core`: generic debug-center logic, portable across repos
- `adapter`: project-specific bridge to runtime traces, DOM, network, ownership, and evidence capture
- `contracts`: canonical event shapes and invariants
- `stores`: single-writer state containers
- `ui`: presentation only
- `export`: bundle/report assembly

## Current Boundary

The current runtime integration is intentionally ReportForge-specific at the adapter boundary:

- ReportForge emits `RF_UI_TRACE`
- the sidecar reads `RF_UI_TRACE` as the primary signal
- the sidecar does not mutate ReportForge runtime state

This is the only place where ReportForge naming is allowed today. The core should remain generic when future adapters are added.

## Planned Future Adapters

The directory layout is intended to support future adapters such as:

- `tools/debug-center/adapters/reportforge/`
- `tools/debug-center/adapters/sap-b1-linux/`
- `tools/debug-center/adapters/autolab/`

Those adapters should implement the same contract without importing each other's internals.

## Canonical Event Schema

Future portable adapters should emit a normalized event shape like:

- `timestamp`
- `app`
- `project`
- `module`
- `source`
- `action`
- `severity`
- `before`
- `after`
- `dom`
- `state`
- `request`
- `response`
- `result`
- `error`
- `owner`
- `evidence`

The core should consume this normalized schema rather than project-specific field names.

For the future "level god" engines, this schema is the minimum evidence contract.
Any engine-specific payload must remain additive and never replace the canonical
fields above.

The intended high-signal evidence fields for advanced diagnostics are:

- `engine`
- `eventId`
- `transactionId`
- `durationMs`
- `ownerExpected`
- `writerActual`
- `invariant`

Representative future evidence schema:

```json
{
  "timestamp": "...",
  "project": "reportforge",
  "engine": "loop|performance|async|state|network|dom",
  "module": "...",
  "source": "...",
  "action": "...",
  "severity": "debug|info|warning|error",
  "eventId": "...",
  "transactionId": "...",
  "before": {},
  "after": {},
  "state": {},
  "dom": {},
  "request": {},
  "response": {},
  "durationMs": 0,
  "ownerExpected": "...",
  "writerActual": "...",
  "invariant": "...",
  "result": "...",
  "error": null
}
```

## Ownership Rules

Each project must have its own ownership map.

Requirements:

- one subsystem
- one owner file
- one authorized writer
- explicit readers
- explicit forbidden writers
- public API list
- invariants

## V1 Visual Evidence / Screenshots

Visual Evidence provides safe, controlled visual capture from within RF Debug Center.

### Capabilities detected at runtime

- `canCapture` — html2canvas present
- `canBlob` / `canUrl` / `canDownload` — export support
- `canClipboardImg` — clipboard image write support

Falls back to `metadata-only` when capture library is unavailable. No external library is loaded — uses `window.html2canvas` only if already present in the host page.

### Capture targets

- `debug-panel` — the debug center root element
- `preview` — `#preview-layer` / `#preview-content`
- `document` — `#canvas-layer`
- `selection` — `.selection-overlay` / `[data-selection-active]`
- `toolbar` — `#toolbar` / `.toolbar`
- `viewport` — metadata-only (full page dimensions)
- `full-page` — metadata-only (safe fallback)

### Evidence record schema

```json
{
  "id": "ve-...",
  "timestamp": "...",
  "target": "preview|selection|debug-panel|toolbar|viewport|full-page|unknown",
  "status": "captured|skipped|failed|metadata-only",
  "mimeType": "image/png",
  "width": 0,
  "height": 0,
  "bytes": 0,
  "selector": "...",
  "reason": null,
  "dataUrl": null,
  "metadata": {},
  "redactions": []
}
```

### API

- `captureVisualEvidence(target)` — capture a target and record evidence
- `clearVisualEvidence()` — clear all evidence records
- `copyVisualEvidenceJSON()` — copy evidence snapshot as JSON
- `getVisualEvidenceSnapshot()` — read current snapshot
- `getState().visualEvidence` — access via store state

### Security and privacy

- No capture of cookies, tokens, headers, or backend payloads.
- `input[type=password]` detected → `VISUAL_PASSWORD_INPUT_PRESENT` redaction applied.
- `dataUrl` excluded from bundle by default (metadata only in bundle).
- Max dataUrl: 512KB. Exceeding this falls back to `metadata-only`.
- No external network calls. No OCR. No server upload.

### Findings emitted

| Code | Severity | Trigger |
|---|---|---|
| `VISUAL_CAPTURE_UNSUPPORTED` | info | No capture library available |
| `VISUAL_TARGET_MISSING` | warning | Target selector not found |
| `VISUAL_TARGET_HIDDEN` | warning | Target exists but not visible |
| `VISUAL_CAPTURE_TOO_LARGE` | warning | dataUrl exceeds 512KB |
| `VISUAL_METADATA_ONLY` | info | Async capture initiated, metadata returned |
| `VISUAL_CAPTURE_FAILED` | error | Exception during capture |
| `VISUAL_PASSWORD_INPUT_PRESENT` | warning | Password input inside target |
| `VISUAL_EVIDENCE_RISK` | warning | W1 warning: one or more captures failed |

### No-mutation contract

- Does not write to `RF_UI_TRACE`.
- Does not write to `DS`.
- Does not move DOM nodes.
- Does not change productivo styles.
- Does not trigger render or preview.
- Does not change zoom or scroll.

## Future Engine Scope

The next engines must stay decoupled from ReportForge internals by design:

- `Loop & Freeze Engine`
  - event storms, freeze detection, ring buffer, last-known-good context
- `Performance Engine`
  - handler duration, render duration, long tasks, event rate, slow ops
- `Async/Race Engine`
  - request IDs, render IDs, state revisions, stale writes, out-of-order work
- `State & Ownership Engine`
  - before/after, owner expected, writer actual, invariant checks, intruders
- `Network/Backend Engine`
  - fetch/XHR observation, duration, status, resumable payload summaries
- `DOM/Visual Engine`
  - real DOM visibility, geometry, computed style, elementFromPoint, divergence

These are roadmap contracts only. They are not implemented in this phase.

## PORT0 — Adapter Boundary / Core Contract

`PORT0` creates the formal separation between the generic debug center core and
the ReportForge-specific adapter. It does not change runtime behavior.

Files created:

- `adapters/debug-center-adapter-contract.js` — canonical contract, `validateAdapter()`, `normalizeEventShape()`
- `adapters/reportforge/reportforge-adapter.js` — ReportForge adapter v1
- `adapters/reportforge/reportforge-adapter-metadata.js` — static metadata (selectors, paths, flags)

Contract summary:

- Required adapter fields: `id`, `name`, `project`, `version`
- Required methods: `getTraceSource`, `getOwnershipMap`, `getEnvironment`, `normalizeEvent`
- Canonical event schema: timestamp, source, action, severity + optional fields
- `validateReportforgeAdapter()` verifies compliance — returns `{ valid: true, errors: [] }`

Wiring of `reportforgeAdapter` into the runtime store/API is deferred to PORT1.

## Non-Goals

The following are not part of the core:

- ReportForge zoom/preview implementation details
- `ZoomEngine` internals
- `PreviewEngineRenderer` internals
- selection and drag runtime logic
- backend business logic

The sidecar observes those systems through adapters only.
