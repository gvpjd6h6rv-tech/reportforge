# E2R V2 Non-Scoreable Ownership Structural Tooling

Evidence Level: L4

## Baseline A

- Base commit: `2c0ebbcb8538ce0bb7ad0497e360ddecf6202a75`.
- The baseline checker recognized legacy `allowedFiles` but did not recognize exact `allowedPaths` for non-scoreable ownership checks.
- Baseline subsystem observations: E2R-V2-TOOLING had 64 violations and E2R-V2-TESTS had 103 violations.
- `t71` remains a pre-existing E2R regression baseline failure.

## Scenario B

- The checker recognizes exact repo-relative `allowedPaths` while preserving legacy `allowedFiles` behavior.
- Duplicate and conflicting ownership claims remain rejected deterministically.
- The Structural Tooling governance entry uses an allowed schema domain, `designer-runtime`, without changing its owner, tier, claims, or test coverage.
- The fix branch requires this report for debugging-policy evidence.

## A/B diff

- Exact `allowedPaths` claims no longer produce the previously observed false-positive ownership classification.
- Candidate-minus-baseline violation differences remain zero.
- Official SP is 18 for the checker and 14 for `t40`, within the MODIFY limit of 20.
- The governance domain correction changes one metadata field only; it does not extend the schema.

## Evidence

- Reproduction command: `node audit/subsystem_ownership_guard.mjs`.
- Checker tests: `t40` and `t47` through `t51` pass.
- The official governance workflow still reports four unrelated pre-existing governance guardrail failures involving shell size and facade-thinness thresholds.

## Regression test

- Tests: `t40`, `t47`-`t51`, `t127`, `t128`, `t70`, `t73`, `t74`, `t75`, and `t119`-`t128`.
- The targeted tests pass in the combined validation scratch.
- The full E2R suite retains only pre-existing `t71` failure.

## Residual risk

- The subsystem gates continue to exit 1 because of baseline ownership debt.
- The Governance guardrails workflow has four unrelated baseline architecture/size failures and cannot be represented as green by this plan.
- `audit/subsystem_ownership_map.json` remains a centralized governance registry; modularization is deferred to a separate File Plan.
- E2R remains a separate, unintegrated implementation.
