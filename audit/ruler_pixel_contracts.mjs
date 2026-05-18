/**
 * ruler_pixel_contracts.mjs — Ruler geometry contracts for pixel-contracts.mjs
 *
 * Expresses all 13 invariants from ruler_rendered_geometry_guard.mjs as
 * declarative contracts consumable by runContracts().
 *
 * Invariant index:
 *   INV-1    topRuler.h ≈ sideRuler.w                       custom
 *   INV-2    corner.w   ≈ sideRuler.w                       custom
 *   INV-3    corner.h   ≈ topRuler.h                        custom
 *   INV-4    hCanvas CSS h fills #ruler-h-row               height: fill-parent
 *   INV-5    vCanvas CSS w fills #ruler-v                   width:  fill-parent
 *   INV-6    hCanvas bitmap.h = CSS h × DPR                 canvas.backingStore
 *   INV-7    vCanvas bitmap.w = CSS w × DPR                 canvas.backingStore
 *   INV-8    #ruler-h-inner not clipped                     overflow: none
 *   INV-8b   #ruler-v-inner not clipped                     overflow: none
 *   INV-9    #ruler-h-row no distorting transform           transform
 *   INV-9b   #ruler-v    no distorting transform            transform
 *   INV-10   RuntimeConfig.ruler.topPx = rendered h         custom (context)
 *   INV-11   RuntimeConfig.ruler.sidePx = rendered w        custom (context)
 *   INV-12   |paintedTopThickness - paintedSideThickness| ≤ 1   custom (pixelScan)
 *   INV-13   paintedSideThickness ≥ 20px                    pixelScan.minPaintedThicknessPx
 *
 * Pass context when calling runContracts():
 *   context: await page.evaluate(() => window.RF?.RuntimeConfig?.ruler ?? null)
 *
 * Pixel scan bgColor [128,128,128] matches the workspace canvas background
 * (#808080) confirmed by screenshot analysis in the original guard.
 */

import { DEFAULT_TOLERANCE_PX } from './pixel-contracts.mjs';

const TOL    = DEFAULT_TOLERANCE_PX;   // 1.5 px
const WS_BG  = [128, 128, 128];        // workspace grey (#808080)
const WS_TOL = 15;

// ── Selectors ────────────────────────────────────────────────────────────────

const S = {
  hRow:   '#ruler-h-row',
  hInner: '#ruler-h-inner',
  vCol:   '#ruler-v',
  vInner: '#ruler-v-inner',
  corner: '#ruler-corner',
};

// ── Cross-element custom validators ──────────────────────────────────────────

function _approxEqual(a, b, tol, label) {
  const diff = Math.abs(a - b);
  if (diff > tol) return [{ id: label, detail: `${a.toFixed(2)} vs ${b.toFixed(2)} — diff ${diff.toFixed(2)}px > ${tol}px` }];
  return [];
}

function _rulerSymmetry(measurements) {
  const hRow   = measurements[S.hRow];
  const vCol   = measurements[S.vCol];
  const corner = measurements[S.corner];
  const violations = [];

  // Emit explicit violations for missing/errored elements instead of silently
  // skipping invariants — a missing element is itself a failure.
  const missing = (sel, m) => !m?.rect
    ? `${sel} ${m?.error ?? '(not measured — selector not in any contract?)'}` : null;

  const noHRow   = missing(S.hRow,   hRow);
  const noVCol   = missing(S.vCol,   vCol);
  const noCorner = missing(S.corner, corner);

  if (noHRow || noVCol)
    violations.push({ id: 'INV-1-MEASURE', detail: `cannot check symmetry: ${[noHRow, noVCol].filter(Boolean).join('; ')}` });
  else
    violations.push(..._approxEqual(hRow.rect.h, vCol.rect.w, TOL, 'INV-1'));

  if (noCorner || noVCol)
    violations.push({ id: 'INV-2-MEASURE', detail: `cannot check corner.w ≈ sideRuler.w: ${[noCorner, noVCol].filter(Boolean).join('; ')}` });
  else
    violations.push(..._approxEqual(corner.rect.w, vCol.rect.w, TOL, 'INV-2'));

  if (noCorner || noHRow)
    violations.push({ id: 'INV-3-MEASURE', detail: `cannot check corner.h ≈ topRuler.h: ${[noCorner, noHRow].filter(Boolean).join('; ')}` });
  else
    violations.push(..._approxEqual(corner.rect.h, hRow.rect.h, TOL, 'INV-3'));

  return violations;
}

function _runtimeConfigAlignment(measurements, _pixelRegions, context) {
  if (!context) return [];
  const violations = [];
  const hRow = measurements[S.hRow];
  const vCol = measurements[S.vCol];

  // INV-10: RuntimeConfig.ruler.topPx = rendered topRuler.h
  if (context.topPx !== undefined) {
    if (typeof context.topPx !== 'number')
      violations.push({ id: 'INV-10-TYPE', detail: `RuntimeConfig.ruler.topPx is not a number: ${JSON.stringify(context.topPx)}` });
    else if (!hRow?.rect)
      violations.push({ id: 'INV-10-MEASURE', detail: `${S.hRow} not measured: ${hRow?.error ?? '(not in contracts)'}` });
    else
      violations.push(..._approxEqual(context.topPx, hRow.rect.h, TOL, 'INV-10'));
  }

  // INV-11: RuntimeConfig.ruler.sidePx = rendered sideRuler.w
  if (context.sidePx !== undefined) {
    if (typeof context.sidePx !== 'number')
      violations.push({ id: 'INV-11-TYPE', detail: `RuntimeConfig.ruler.sidePx is not a number: ${JSON.stringify(context.sidePx)}` });
    else if (!vCol?.rect)
      violations.push({ id: 'INV-11-MEASURE', detail: `${S.vCol} not measured: ${vCol?.error ?? '(not in contracts)'}` });
    else
      violations.push(..._approxEqual(context.sidePx, vCol.rect.w, TOL, 'INV-11'));
  }

  return violations;
}

function _paintedSymmetry(_measurements, pixelRegions) {
  // INV-12: |paintedTopThickness - paintedSideThickness| ≤ 1
  const top  = pixelRegions['ruler-h-row-scan']?.paintedThickness;
  const side = pixelRegions['ruler-v-col-scan']?.paintedThickness;

  // Both undefined: pixel scan failed entirely — let individual PIXEL-SCAN-FAILED
  // violations (emitted per-contract) report the infrastructure failure.
  if (top === undefined && side === undefined) return [];

  // Partial: one scan result is missing — INV-12 cannot be verified.
  if (top === undefined)
    return [{ id: 'INV-12', detail: 'ruler-h-row-scan result absent — cannot verify painted symmetry' }];
  if (side === undefined)
    return [{ id: 'INV-12', detail: 'ruler-v-col-scan result absent — cannot verify painted symmetry' }];

  const diff = Math.abs(top - side);
  if (diff > 1)
    return [{ id: 'INV-12', detail: `painted asymmetry: top=${top}px side=${side}px diff=${diff}px (expected ≤1)` }];
  return [];
}

// ── Contract declarations ─────────────────────────────────────────────────────

export const RULER_CONTRACTS = [

  // ── INV-1 / INV-2 / INV-3 — cross-element size symmetry ─────────────────
  {
    name:   'ruler-geometry-symmetry',
    custom: _rulerSymmetry,
  },

  // ── INV-4 — hCanvas CSS height fills #ruler-h-row ────────────────────────
  {
    name:     'h-canvas-fill-parent-height',
    selector: S.hInner,
    expected: {
      height:          'fill-parent',
      maxTolerancePx:  TOL,
    },
  },

  // ── INV-5 — vCanvas CSS width fills #ruler-v ─────────────────────────────
  {
    name:     'v-canvas-fill-parent-width',
    selector: S.vInner,
    expected: {
      width:           'fill-parent',
      maxTolerancePx:  TOL,
    },
  },

  // ── INV-6 — hCanvas bitmap.h = CSS h × DPR ───────────────────────────────
  {
    name:     'h-canvas-backing-store',
    selector: S.hInner,
    expected: {
      canvas:          { backingStore: true },
      maxTolerancePx:  TOL,
    },
  },

  // ── INV-7 — vCanvas bitmap.w = CSS w × DPR ───────────────────────────────
  {
    name:     'v-canvas-backing-store',
    selector: S.vInner,
    expected: {
      canvas:          { backingStore: true },
      maxTolerancePx:  TOL,
    },
  },

  // ── INV-8 — #ruler-h-inner not clipped by overflow:hidden ────────────────
  {
    name:     'h-canvas-no-overflow-clip',
    selector: S.hInner,
    expected: { overflow: 'none' },
  },

  // ── INV-8b — #ruler-v-inner not clipped ──────────────────────────────────
  {
    name:     'v-canvas-no-overflow-clip',
    selector: S.vInner,
    expected: { overflow: 'none' },
  },

  // ── INV-9 — no distorting CSS transform on #ruler-h-row ──────────────────
  {
    name:     'h-row-no-transform',
    selector: S.hRow,
    expected: { transform: { maxScaleDeviation: 0.01 } },
  },

  // ── INV-9b — no distorting CSS transform on #ruler-v ─────────────────────
  {
    name:     'v-col-no-transform',
    selector: S.vCol,
    expected: { transform: { maxScaleDeviation: 0.01 } },
  },

  // ── Corner geometry — ensures #ruler-corner is measured for INV-2/INV-3 ────
  // No expected shape beyond existence; INV-2/INV-3 are cross-element checks
  // in ruler-geometry-symmetry. Without this contract, #ruler-corner would
  // never appear in measurements and _rulerSymmetry would silently skip.
  {
    name:     'ruler-corner-measured',
    selector: S.corner,
    expected: { overflow: 'none' },
  },

  // ── INV-10 / INV-11 — RuntimeConfig alignment (needs context) ────────────
  {
    name:   'ruler-runtime-config-alignment',
    custom: _runtimeConfigAlignment,
  },

  // ── INV-12 — painted symmetry (cross-contract, Layer 3) ──────────────────
  {
    name:   'ruler-painted-symmetry',
    custom: _paintedSymmetry,
  },

  // ── INV-13 — side ruler painted thickness ≥ 20px (Layer 3) ───────────────
  {
    name:     'ruler-v-col-scan',
    selector: S.vCol,
    expected: {
      pixelScan: {
        axis:                   'v',
        minPaintedThicknessPx:  20,
        bgColor:                WS_BG,
        bgTolerance:            WS_TOL,
      },
    },
  },

  // ── companion pixel scan for INV-12 (horizontal ruler painted area) ───────
  {
    name:     'ruler-h-row-scan',
    selector: S.hRow,
    expected: {
      pixelScan: {
        axis:       'h',
        bgColor:    WS_BG,
        bgTolerance: WS_TOL,
      },
    },
  },
];

// Selector set required — used by the wrapper to await canvas readiness.
export const RULER_CANVAS_SELECTORS = [S.hInner, S.vInner];
export { S as RULER_SELECTORS };
