# Evidence-Driven A/B Debugging Policy

This policy is canonical for Codex and GitHub workflows in this repository.
It applies to bugfix, triage, hardening, and regression work.

## Core Rules

1. Do not patch without evidence.
2. Every bug must be documented with:
   - Baseline A
   - Scenario B
   - A/B diff
   - Evidence
   - Culprit
   - Regression test
   - Residual risk
3. If runtime evidence or a test is missing, label the finding as a hypothesis.
4. Every fix must include a test that fails before the fix and passes after it.
5. Every bugfix PR must fill the required debugging sections before it is considered ready.

## Debugging Evidence Levels

- L1 - Logs / symptoms (weak)
- L2 - A/B diff reproducible
- L3 - Stack trace + causal chain
- L4 - Deterministic reproduction + test (required)

Every bugfix must reach at least L3.

## Evidence Standard

A valid debugging report should include at least one of:

- runtime screenshot or screen recording
- runtime log or stack trace
- code citation with a concrete line-level explanation
- a regression test that proves the cut between healthy and broken behavior

Prefer an A/B comparison over single-point observations:

- A is the known-good baseline
- B is the broken scenario
- the delta explains the root cause
- the test must prove the fix, not just the implementation

If the issue cannot be observed at runtime and cannot be isolated by a test, treat the diagnosis as a hypothesis and stop before patching.

## Bugfix PR Requirements

Bugfix and fix branches must provide:

- Baseline A
- Scenario B
- A/B diff
- Evidence
- Culpable
- Regression test
- Residual risk
- Evidence Level: L3 or L4

They must also include a debug report file at:

- `docs/debug-reports/<ticket>.md`

where `<ticket>` is the branch ticket or slug associated with the bugfix branch.

## Report Format

Use these sections in the debug report:

- Baseline A
- Scenario B
- A/B diff
- Evidence
- Culpable
- Regression test
- Residual risk

If a section is not yet known, state why it is still a hypothesis.

## Non-Bugfix PRs

Docs, chore, and refactor PRs are not blocked by debug-report requirements unless the branch name itself is `bugfix/*` or `fix/*`.

## Operating Rule

When in doubt, gather evidence first, then patch minimally, then prove the fix with a regression test.
