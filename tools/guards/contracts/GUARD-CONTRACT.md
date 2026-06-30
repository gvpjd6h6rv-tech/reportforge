# RF Guard Contract — Phase 2 SSOT

> This is the **single source of truth** for what a guard/checker/runner/map/cli
> is allowed to be. It is created **before** any code is moved (Phase 2 goal).
> No guard is migrated, no `scanRoots` changes, no gate is made blocking here.

## Layer responsibilities (1 thing each)

| Layer | Allowed to | Must NOT |
|-------|-----------|----------|
| `guard` | Decide pass/fail for **one** responsibility; emit `{ value, evidence[] }` | Contain more than one rule, do I/O orchestration |
| `checker` | Implement **one** pure rule: `(filePath, text, ...args) → { value, evidence[] }` | Read files, exit process, hold state |
| `runner` | **Only** orchestration: collectors → checkers → reporter | Contain rule/threshold/formula logic |
| `map` | **Only** data (JSON) | Contain logic or executable code |
| `cli` | **Only** I/O: argv in, exit code / stdout out | Contain rule logic or orchestration |

## Checker / guard runtime shape

```js
/** RULE: <one sentence>. */
export function checkX(filePath, text /*, args */) {
  // pure: no fs, no process.exit, no globals
  return { value: <boolean>, evidence: pass ? [] : [`${filePath}: <why>`] };
}
```

- Exactly **one** `export function` per checker file (enforced by
  `check_guard_single_rule` / `check_checker_single_contract`).
- `value` is the pass boolean. `evidence[]` is human-readable, file-anchored.

## Map entry contract

Each row in [`../maps/guards-map.json`](../maps/guards-map.json) MUST validate
against [`guard-entry.schema.json`](./guard-entry.schema.json):

| Field | Meaning |
|-------|---------|
| `id` | unique kebab-case |
| `layer` | `guard \| checker \| runner \| map \| cli` |
| `rule` | single-responsibility sentence (one rule, no `" and "` joining two) |
| `ruleReviewed` | `false` = auto-derived from filename, pending human review |
| `pathCurrent` | existing path (must exist on disk when `state=existing`) |
| `owner` | accountable owner (required) |
| `state` | `existing \| planned \| deprecated` |
| `test` | path to the 1:1 contract test, or `null` |
| `blocking` | **must be `false`** in Phase 2 |

## Invariants enforced by the Phase 2 test

See [`tests/architecture/guards_map_contract.test.mjs`](../../../tests/architecture/guards_map_contract.test.mjs):

1. Every entry validates against the schema (shape + types + enums).
2. `id` is unique across the map.
3. `blocking === false` for every entry (Phase 2 freeze).
4. `rule` carries exactly one rule (no `" and "` conjunction joining two rules).
5. `state=existing` ⇒ `pathCurrent` is non-null **and the file exists on disk**.
6. `layer` is one of the declared layers; `state` is one of the declared states.

## What Phase 2 deliberately does NOT do

- Does not migrate the 49 `audit/*_guard.mjs` or the salad-score checkers.
- Does not touch `validate_repo.sh`.
- Does not widen `salad-score.config.json` `scanRoots`.
- Does not add any new guard.
- Does not make anything blocking.
