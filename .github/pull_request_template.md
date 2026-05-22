<!-- Canonical debugging template. Keep synchronized with .github/PULL_REQUEST_TEMPLATE.md for GitHub compatibility. -->

## Baseline A

- What is the healthy baseline?
- Runtime evidence:
- Code citation:

## Scenario B

- What is broken?
- Runtime evidence:
- Stack or log:

## A/B diff

- What changed between the healthy baseline and the broken scenario?
- Root-cause note:

## Evidence

- Screenshot / recording:
- Stack / log:
- Code citation:
- If runtime evidence is missing, mark this section as a hypothesis.

## Culpable

- Concrete file / line / function:
- Why this is the root cause:

## Regression test

- Test name:
- Command:
- Fails before:
- Passes after:

## Evidence Level

- Evidence Level: L3 or L4

## Residual risk

- What remains unverified:
- Why that risk is acceptable:

## Notes

- If this is a non-bugfix PR, mark any N/A sections clearly.
- If this is a bugfix or fix branch, the report file `docs/debug-reports/<ticket>.md` is required.
