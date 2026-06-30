# tools/guards — Modular Guard SSOT (Phase 2)

This directory holds the **contract and catalog** for RF's self-defending guard
architecture. Phase 2 establishes the SSOT **before** any code is moved.

```
tools/guards/
  contracts/
    guard-entry.schema.json   # JSON-Schema for one guards-map.json row
    GUARD-CONTRACT.md         # layer responsibilities + invariants
  maps/
    guards-map.json           # data-only catalog of every guard/checker/runner/map/cli
  README.md                   # this file
```

Validation test: [`tests/architecture/guards_map_contract.test.mjs`](../../tests/architecture/guards_map_contract.test.mjs)

Run it:

```bash
node --test tests/architecture/guards_map_contract.test.mjs
```

## Status

- **Phase 1** — audit (`audit/RF-ARCH-MODULAR-GUARDS-PHASE-1.md`) ✅
- **Phase 2** — contract + `guards-map.json` SSOT (this dir) ← you are here
- Phase 3+ — migrate guards, add missing guards, runner, CI gate (not started)

## Catalog at a glance

`guards-map.json` currently catalogs the **existing** assets by their current
path (nothing moved):

- `layer: guard` — the 49 `audit/*_guard.mjs`
- `layer: checker` — the 15 `tools/salad-score/checkers/*.mjs`
- `layer: runner` / `cli` / `map` — the salad-score singletons

`blocking` is `false` for all entries (Phase 2 freeze). `ruleReviewed: false`
marks rule text that was auto-derived from the filename and still needs human
confirmation — an honest evidence flag, not a placeholder pretending to be done.

## Rules (recap)

1 guard = 1 rule · 1 checker = 1 rule · 1 runner = orchestration only ·
1 map = data only · CLI = I/O only.
