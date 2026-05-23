# RF Debug Center — Adapters

This directory contains the adapter boundary contract and the first production adapter for ReportForge.

## Structure

```
adapters/
├── debug-center-adapter-contract.js   # Canonical contract + validation + normalizer
└── reportforge/
    ├── reportforge-adapter.js          # ReportForge adapter v1 (implements contract)
    ├── reportforge-adapter-metadata.js # Static metadata (no runtime deps)
    └── README.md
```

## Contract

`debug-center-adapter-contract.js` defines:

- `ADAPTER_CONTRACT` — frozen object with required fields, required methods, capabilities list, and canonical event schema
- `validateAdapter(adapter)` — checks an adapter object against the contract. Returns `{ valid, errors }`. Does not throw.
- `normalizeEventShape(raw)` — converts any raw event to the canonical schema. Missing fields get safe defaults. Does not mutate input.
- Optional adapter methods may include `getDomSelectors()`, `getDomTargets()`, `getNetworkPaths()`, `getActivationFlags()`, and `dispose()`.

### Required adapter fields

- `id` — unique adapter identifier (e.g. `'reportforge'`)
- `name` — human-readable name
- `project` — project identifier
- `version` — semver string

### Required adapter methods

- `getTraceSource(win?)` — returns the trace source object (or absent/invalid state)
- `getOwnershipMap(win?)` — returns the ownership map or null
- `getEnvironment(win?, doc?)` — returns environment snapshot
- `normalizeEvent(raw)` — normalizes a raw event to canonical shape

### Canonical event schema

Required fields: `timestamp`, `source`, `action`, `severity`

Optional fields: `project`, `module`, `engine`, `eventId`, `transactionId`, `before`, `after`, `state`, `dom`, `request`, `response`, `durationMs`, `ownerExpected`, `writerActual`, `invariant`, `result`, `error`

Valid severities: `debug`, `info`, `warning`, `error`

## Rules

- No globals in any adapter file
- No window writes except via the bootstrap (`rf-debug-center.js`)
- Adapter reads runtime internals (traces, DS, DOM) — never writes them
- ReportForge-specific knowledge lives in the ReportForge adapter only
- Future adapters implement the same contract independently

## Adapters

| Adapter | Status | Trace source |
|---|---|---|
| `reportforge/` | SAP0 LISTO — PORT0 wired | `window.RF_UI_TRACE` |
| `sap-b1-linux/` | SAP1 LISTO — read-only, not yet wired | `window.__CAUSAL_LOG__` |
| `autolab/` | BACKLOG — not implemented | — |

Each adapter must implement the full contract without importing another adapter's internals.
