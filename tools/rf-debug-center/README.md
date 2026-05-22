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
- `R1` - render / preview engine
- `V1` - visual evidence / screenshots
- `F1` - final hardening

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

## Non-Goals

The following are not part of the core:

- ReportForge zoom/preview implementation details
- `ZoomEngine` internals
- `PreviewEngineRenderer` internals
- selection and drag runtime logic
- backend business logic

The sidecar observes those systems through adapters only.
