# RF-ARCH-MODULAR-GUARDS-PHASE-2 — Gap Report

> SSOT created **before** moving code. Contract test green (8/8).
> No guard migrated · `validate_repo.sh` untouched · `scanRoots` unchanged ·
> nothing blocking.

## Delivered

| Artifact | Path |
|---|---|
| Guard entry schema | `tools/guards/contracts/guard-entry.schema.json` |
| Contract spec | `tools/guards/contracts/GUARD-CONTRACT.md` |
| SSOT catalog | `tools/guards/maps/guards-map.json` (68 entries) |
| README | `tools/guards/README.md` |
| Contract test (1 file = 1 contract) | `tests/architecture/guards_map_contract.test.mjs` |

Test result: **8 pass / 0 fail** (`node --test tests/architecture/guards_map_contract.test.mjs`).

## Catalog composition

| Layer | Count |
|---|---|
| guard (`audit/*_guard.mjs`) | 50 |
| checker (`tools/salad-score/checkers/*`) | 15 |
| runner | 1 |
| cli | 1 |
| map | 1 |
| **total** | **68** |

## Gaps (honest debt, accepted, not hidden)

| Gap | Count | Why it's acceptable in Phase 2 | Closes in |
|---|---|---|---|
| `ruleReviewed:false` (rule auto-derived from filename) | 65 / 68 | Flagged explicitly; no rule pretends to be final (no fake-green) | Phase 3 (per-guard review) |
| `test:null` (no 1:1 contract test yet) | 68 / 68 | Phase 2 validates the **catalog**, not each guard's behavior | Phase 5 (architecture tests) |
| `blocking:false` everywhere | 68 / 68 | Intentional freeze — no gate until guards are migrated+reviewed | Phase 6 (CI gate) |
| Guards still in `audit/`, not `tools/guards/` | 50 | "No migrar todos los guards todavía" | Phase 3 (migration) |
| Missing guards not yet catalogued | 5 | `no-hardcoded-secrets`, `no-sql-concat`, `no-preview-sql`, `no-ci-diagnostics`, `no-artifacts-committed` — add as `state:planned` | Phase 3 |
| Layer coverage = `engines/` only (salad-score) | — | "No ampliar scanRoots aún" | Phase 6 |

## UDS 4.1 compliance

- **Contract + Ownership First**: schema + owner field land before any migration.
- **No fake-green**: `ruleReviewed:false` marks derived text honestly; test asserts real on-disk paths.
- **No evidence debt**: every `existing` entry's `pathCurrent` is verified to exist on disk by the test.
- **No technical debt without acceptance**: gaps table above is the explicit acceptance record.
- **No implementation before audit**: Phase 1 audit precedes this; no new guard implemented.

## Next (Phase 3 — not started)

1. Add the 5 missing guards as `state:planned` rows.
2. Review rule text per guard (`ruleReviewed:true`) starting with the 10 minimum guards.
3. Begin migration `audit/*_guard.mjs` → `tools/guards/`, updating `pathCurrent`.
