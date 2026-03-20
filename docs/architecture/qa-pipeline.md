# QA Pipeline — ReportForge v18.0

## Overview

The ReportForge QA system runs **43 scripts** covering 1000+ automated assertions. The master orchestrator is `repo-super.sh`.

## Running the Pipeline

```bash
bash repo-super.sh                    # Full pipeline (7 groups, fail-fast)
bash repo-designer-god.sh             # Single master check (60 assertions)
bash repo-layout-invariants.sh        # Layout invariant engine
node sandbox/god-level-qa.js          # 955 engine tests (no browser)
```

## Pipeline Structure

```
repo-super.sh
  ├── GROUP 1: Core Engine
  │   ├── repo-performance.sh         drag latency, FPS
  │   ├── repo-geometry.sh            snap precision, coord invariants
  │   ├── repo-floating-point.sh      zoom cycles, MagneticSnap idempotency
  │   └── repo-layout-hash.sh         layout fingerprint stability
  │
  ├── GROUP 2: Interaction
  │   ├── repo-interaction.sh         drag, snap, zoom, preview
  │   ├── repo-snap.sh                guide alignment, flicker, jitter
  │   ├── repo-zoom.sh                viewport arch, limits, world coords
  │   ├── repo-undo-integrity.sh      undo/redo exact state restore
  │   ├── repo-idempotency.sh         commands idempotent on repeat
  │   ├── repo-determinism.sh         same ops = same result
  │   └── repo-replay.sh              interaction log replay
  │
  ├── GROUP 3: Designer Structure
  │   ├── repo-layout.sh              13 layout checks
  │   ├── repo-visual.sh              rulers, gutter, canvas alignment
  │   ├── repo-layout-reflow.sh       viewport resize stability
  │   └── repo-layout-invariants.sh   12 invariants × 6 scenarios
  │
  ├── GROUP 4: Stress & Chaos
  │   ├── repo-multi-object.sh        200 objects: drag/align/zoom/snap
  │   ├── repo-memory.sh              DOM node + listener growth
  │   ├── repo-crash-guard.sh         invalid inputs, extreme zoom
  │   ├── repo-layout-stress.sh       30 extra objects + align stress
  │   └── repo-extension-safety.sh    layout integrity after JS injection
  │
  ├── GROUP 5: Validation
  │   ├── repo-state-machine.sh       idle→drag→select→zoom transitions
  │   ├── repo-command-idempotency.sh commands don't corrupt layout
  │   ├── repo-serialization.sh       save/reload preserves state
  │   ├── repo-input-devices.sh       touch, trackpad, precision wheel
  │   ├── repo-performance-budget.sh  drag <16ms, zoom <20ms, FPS ≥30
  │   └── repo-latency.sh             drag-start, selection, undo latency
  │
  ├── GROUP 6: UI & Coverage
  │   ├── repo-command-matrix.sh      84/84 commands (100%)
  │   ├── repo-ui-explorer.sh         87 controls discovered
  │   ├── repo-ui-enhanced.sh         95 controls, repo-ui-map.json
  │   └── repo-ui-state.sh            snapshot_before/after comparison
  │
  ├── GROUP 7: Visual Regression
  │   └── repo-visual-diff.sh         baseline screenshot comparison
  │
  └── MASTER GATE
      └── repo-designer-god.sh        60 checks (DOM+rulers+keyboard+snap+zoom+drag+chaos)
```

## Layout Invariants

`repo-layout-invariants.sh` validates 12 invariants across 6 scenarios:

| Invariant | Rule |
|-----------|------|
| INV-01 | `canvasLeft >= verticalRulerRight` |
| INV-02 | `canvasTop >= horizontalRulerBottom` |
| INV-03 | `workspaceLeft == verticalRulerRight` |
| INV-04 | `canvas.transform === 'none'` |
| INV-05 | `verticalRuler.offsetWidth > 0` |
| INV-06 | `horizontalRuler.width > 0` |
| INV-07 | `canvas.offsetWidth === 754` |
| INV-08 | canvas never overlaps ruler |
| INV-09 | workspace never overlaps ruler |
| INV-10 | `zoom ∈ [0.25, 4.0]` |
| INV-11 | `ruler-v-inner.height >= workspace.clientHeight` |
| INV-12 | `DS.elements.length > 0` |

Scenarios: baseline · zoom×2 · zoom×0.5 · selection · preview · 30-op stress

## Known Baselines (v18.0)

| Metric | Value |
|--------|-------|
| god-level tests | 955/955 |
| layout invariant tests | 43/43 |
| designer god tests | 60/60 |
| command matrix | 84/84 (100%) |
| UI controls tested | 57/57 (100%) |
| drag latency p50 | ~83ms |
| FPS during drag | 61 |
| CanvasEngine.renderAll | ~1ms |
| canvas offsetWidth | 754px (invariant) |
| ruler-v width | 24px |
