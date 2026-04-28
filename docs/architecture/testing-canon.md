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
- Formula parsing and evaluation must stay split into facade, tokenizer, AST, parser core, evaluator entrypoint, evaluation dispatcher, function-dispatch owner, resolution owner, aggregate owner, coercion owner, and compatibility wrapper.
- Crystal Reports function catalog must stay split into facade, shared coercion helpers, family owners, and registry owner.
- Db source loading must stay split into facade, cache, engine lifecycle, loader, queries, introspection, and registry owners.
- Datasource package loading must stay split into a thin facade plus `DataSource` and `MultiDataset` owners.
- Document store runtime must stay split into facade, state, selectors, actions, and history owners, with `DS.state` as the source of truth.
- Engine core routing must stay split into facade, pointer routing, zoom hooks, registry wiring, and workspace wiring owners.
- No bug fix may require touching more than two files unless the architecture itself is being cut.
- No new monster files.
- Every runtime concern must have a single source of truth.
- Shadow DOM and enterprise CSS are the default for isolated UI surfaces.
- Fine geometry and persistence precision must be asserted with tolerance-based tests; legacy integer-grid assumptions are not canonical.
- FastAPI API tests must keep the facade thin: request models, helpers, and route groups must stay in dedicated owners with guardrails for size and import boundaries.
- Formula and debug runtime tests must keep the owners split: formula parsing/evaluation, formula editor UI, debug state, debug panels, and debug overlay each have a dedicated owner module and a facade-only compatibility shell.

## Designer Shell Canon

- CSS bleed guard, host vs panel width contract, DOM ownership tags, layout drift assertion, and writer conflict log are canonical runtime invariants.
- These invariants must be backed by guardrail tests and must fail fast on regression.
- If a shell change touches width, ownership, or layout order, the associated guardrails must be updated in the same change.
- Document store guardrails must stay aligned with the facade/state/actions/history split and the `DS.state` source-of-truth contract.
- Engine core routing guardrails must stay aligned with the facade/pointer/zoom/registry/workspace split.

## Test Categories

The repo should keep explicit coverage for these categories:

| Category | What it protects | Representative suites |
|---|---|---|
| Architectural | ownership, canonicity, forbidden bridges | `governance_guardrails`, `engine_contracts`, `validate_repo.sh` |
| Behavioral | user-visible runtime behavior | `runtime_regression`, `user_parity/*` |
| Causal | event and state causality | `tanda*`, `engine_contracts` |
| Conductual | interaction flow under user intent | `content_edit_smoke_user_parity`, `template_smoke_user_parity` |
| Functional | core outputs and API contracts | `test_render_engine`, `test_advanced_engine`, `test_enterprise`, `test_server` |
| Formula | parser, tokenizer, AST, evaluator, function catalog, and JS/Python coercion parity | `test_formula_engine`, `type_coercion_js` |
| CR Functions | family split, registry, and callable dispatch contracts | `test_cr_functions` |
| Datasource | db source facade, cache, engine lifecycle, queries, introspection, and registry contracts | `test_phases_3_5` |
| All Gaps | backlog and ownership gaps | `transformation-backlog`, `ownership-matrix` |
| Geometric | rects, handles, overlay alignment | `multiselect_drag_user_parity`, `preview_clipping_user_parity`, `resize_smoke_user_parity` |
| Reparability | safe mode, recovery, invariant repair | `runtime_regression`, `EngineCore` safe mode paths |
| Race conditions | fast repeated user actions | `fast_interaction_smoke_user_parity`, `flaky_detection_user_parity` |
| Network / latency | delayed input and server response resilience | `test_server`, `runtime_harness`, slow-path smoke tests |
| Browser-specific | cross-browser divergence | `visual_golden_user_parity`, `selection_handle_stacking_user_parity` |
| Global state corruption | corrupt globals, duplicate owners, drift | `RuntimeGlobals`, `RuntimeServices`, `EngineCore` |
| Memory leaks | repeated flows and cleanup safety | `session_replay_user_parity`, repeated-init smoke tests |
| Human unpredictability | random or mixed user actions | `undo_redo_mixed_history_user_parity`, `session_replay_user_parity` |

## Three-Attempt Convergence Rule

If fixing a bug requires more than three attempts, the bug is a symptom of an architectural gap, not an isolated defect. The rule:

1. **First attempt** — targeted fix in the owning module + one focused test.
2. **Second attempt** — if the fix fails, identify the real owner (check SSOT, contracts, guard failures) and fix there. The second fix must still touch at most two files.
3. **Third attempt** — if still failing, stop fixing and open a gap entry in `audit/principles_matrix.json`. The architecture needs a new invariant, not another patch.

**Machine-enforceable proxies:**
- Every bug fix must land with a paired test (verified by code review and governance tests).
- No fix may touch more than two files unless the architecture itself is being cut (already a Canonical Rule above).
- If three attempts are consumed, the resulting gap must be documented with `ci_gate: false` and a specific `gap` description — this surfaces the architectural debt for the next hardening cycle.

**What this rule prevents:**
- Patch-on-patch accumulation that hides the real invariant gap.
- Fixes that pass locally but fail in CI because the wrong layer was patched.
- Silent regressions when the patched callsite is bypassed by a new code path.

## Minimal Repro First (#71)

Before opening a bug or starting a fix, produce the smallest possible reproduction:

1. Strip the report to one section and one element.
2. Verify the defect reproduces with that minimal document.
3. If it does not reproduce minimally, the bug is context-dependent — document the context before patching.

**What this rule prevents:**
- Fixes that target the symptom (complex document state) instead of the root cause.
- Wasted investigation in reports that are not relevant to the defect.
- Regressions introduced by fixing for a specific document shape.

`audit/minimal_repro_guard.mjs` verifies this rule is documented here.

## Shared Core Standards (#76)

Every RF deployment must satisfy the following minimum test surface. These are the shared core standards that any fork or derivative must keep:

- `validate_repo.sh` must pass with 0 failures.
- `reportforge/tests/debuggability.test.mjs` must pass.
- `reportforge/tests/governance_guardrails.test.mjs` must pass.
- `reportforge/tests/engine_contracts.test.mjs` must pass.
- `reportforge/tests/race_conditions.test.mjs` must pass.
- All `audit/*.mjs` guards must exit 0.

`audit/shared_core_guard.mjs` verifies this list is documented and the key suites are referenced.

## Enforcement

- Governance tests must fail on inline runtime, duplicate owners, or forbidden shims.
- Architecture tests must fail if a boundary file grows back into a monolith.
- Behavioral suites must stay browser-based for the canonical runtime.
- Any new category must be added to this canon and linked to a real suite.
- The three-attempt convergence rule must remain in this document; `audit/convergence_discipline_guard.mjs` verifies it has not been removed.
- The Minimal Repro First rule must remain in this document; `audit/minimal_repro_guard.mjs` verifies it has not been removed.
- The Shared Core Standards must remain in this document; `audit/shared_core_guard.mjs` verifies it has not been removed.
