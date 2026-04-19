# Testing Canon

## Purpose

RF treats tests as architecture, not decoration.

Every bug fix should land with:

- one owner module
- one primary cause
- one focused test or at most one test file
- no legacy duplicate path unless it is a short-lived shim with a removal plan

## Canonical Rules

- No inline runtime scripts or styles.
- No legacy runtime bridges once a canonical owner exists.
- No module may own more than one domain concern.
- No bug fix may require touching more than two files unless the architecture itself is being cut.
- No new monster files.
- Every runtime concern must have a single source of truth.
- Shadow DOM and enterprise CSS are the default for isolated UI surfaces.

## Test Categories

The repo should keep explicit coverage for these categories:

| Category | What it protects | Representative suites |
|---|---|---|
| Architectural | ownership, canonicity, forbidden bridges | `governance_guardrails`, `engine_contracts`, `validate_repo.sh` |
| Behavioral | user-visible runtime behavior | `runtime_regression`, `user_parity/*` |
| Causal | event and state causality | `tanda*`, `engine_contracts` |
| Conductual | interaction flow under user intent | `content_edit_smoke_user_parity`, `template_smoke_user_parity` |
| Functional | core outputs and API contracts | `test_render_engine`, `test_advanced_engine`, `test_server` |
| All Gaps | backlog and ownership gaps | `transformation-backlog`, `ownership-matrix` |
| Geometric | rects, handles, overlay alignment | `multiselect_drag_user_parity`, `preview_clipping_user_parity`, `resize_smoke_user_parity` |
| Reparability | safe mode, recovery, invariant repair | `runtime_regression`, `EngineCore` safe mode paths |
| Race conditions | fast repeated user actions | `fast_interaction_smoke_user_parity`, `flaky_detection_user_parity` |
| Network / latency | delayed input and server response resilience | `test_server`, `runtime_harness`, slow-path smoke tests |
| Browser-specific | cross-browser divergence | `visual_golden_user_parity`, `selection_handle_stacking_user_parity` |
| Global state corruption | corrupt globals, duplicate owners, drift | `RuntimeGlobals`, `RuntimeServices`, `EngineCore` |
| Memory leaks | repeated flows and cleanup safety | `session_replay_user_parity`, repeated-init smoke tests |
| Human unpredictability | random or mixed user actions | `undo_redo_mixed_history_user_parity`, `session_replay_user_parity` |

## Enforcement

- Governance tests must fail on inline runtime, duplicate owners, or forbidden shims.
- Architecture tests must fail if a boundary file grows back into a monolith.
- Behavioral suites must stay browser-based for the canonical runtime.
- Any new category must be added to this canon and linked to a real suite.
