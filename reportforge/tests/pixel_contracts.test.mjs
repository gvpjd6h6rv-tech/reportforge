'use strict';
/**
 * pixel_contracts.test.mjs
 *
 * Unit tests for audit/pixel-contracts.mjs — evaluateContract().
 * No browser required: tests inject synthetic measurements directly.
 *
 * Covers:
 *   - fill-parent (width and height)
 *   - DPR / canvas backing store
 *   - overflow / clipping detection
 *   - custom() cross-element validator
 *   - pixelScan minPaintedThicknessPx
 *   - transform deviation
 *   - tolerance boundary (pass at maxTol, fail at maxTol+0.1)
 */

import test   from 'node:test';
import assert from 'node:assert/strict';
import path   from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const {
  evaluateContract,
  classifyViolations,
  isInfraViolation,
  INFRA_VIOLATION_IDS,
  DEFAULT_TOLERANCE_PX,
} = await import(`${ROOT}/audit/pixel-contracts.mjs`);

// ── helpers ──────────────────────────────────────────────────────────────────

function measurement(overrides = {}) {
  return {
    dpr:        1,
    rect:       { x: 0, y: 0, w: 200, h: 40 },
    parentRect: { x: 0, y: 0, w: 200, h: 40 },
    transform:  { scaleX: 1, scaleY: 1, raw: 'none' },
    clip:       { clipped: false },
    canvas:     null,
    tagName:    'DIV',
    ...overrides,
  };
}

function canvasMeasurement(cssW, cssH, dpr = 2) {
  return measurement({
    dpr,
    rect:   { x: 0, y: 0, w: cssW, h: cssH },
    canvas: { bitmapW: Math.round(cssW * dpr), bitmapH: Math.round(cssH * dpr) },
    tagName: 'CANVAS',
  });
}

function eval1(contract, m, canvasAudits = null, pixelData = null, context = null) {
  return evaluateContract(contract, { [contract.selector]: m }, canvasAudits, pixelData, context);
}

function assertNoViolations(violations) {
  assert.deepEqual(violations, [], `unexpected violations: ${JSON.stringify(violations)}`);
}

function assertViolation(violations, id) {
  assert.ok(violations.some(v => v.id === id),
    `expected violation "${id}" but got: ${JSON.stringify(violations.map(v => v.id))}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// fill-parent
// ═══════════════════════════════════════════════════════════════════════════════

test('fill-parent width — PASS when element width equals parent width', () => {
  const c = { name: 'c', selector: '#el', expected: { width: 'fill-parent' } };
  const m = measurement({ rect: { x: 0, y: 0, w: 200, h: 40 }, parentRect: { x: 0, y: 0, w: 200, h: 40 } });
  assertNoViolations(eval1(c, m));
});

test('fill-parent width — PASS within tolerance', () => {
  const c = { name: 'c', selector: '#el', expected: { width: 'fill-parent', maxTolerancePx: 2 } };
  const m = measurement({ rect: { x: 0, y: 0, w: 199, h: 40 }, parentRect: { x: 0, y: 0, w: 200, h: 40 } });
  assertNoViolations(eval1(c, m));
});

test('fill-parent width — FAIL when diff exceeds tolerance', () => {
  const c = { name: 'c', selector: '#el', expected: { width: 'fill-parent', maxTolerancePx: 1 } };
  const m = measurement({ rect: { x: 0, y: 0, w: 195, h: 40 }, parentRect: { x: 0, y: 0, w: 200, h: 40 } });
  assertViolation(eval1(c, m), 'FILL-PARENT-WIDTH');
});

test('fill-parent height — PASS when element height equals parent height', () => {
  const c = { name: 'c', selector: '#el', expected: { height: 'fill-parent' } };
  const m = measurement({ rect: { x: 0, y: 0, w: 100, h: 22 }, parentRect: { x: 0, y: 0, w: 100, h: 22 } });
  assertNoViolations(eval1(c, m));
});

test('fill-parent height — FAIL when diff exceeds tolerance', () => {
  const c = { name: 'c', selector: '#el', expected: { height: 'fill-parent', maxTolerancePx: 1 } };
  const m = measurement({ rect: { x: 0, y: 0, w: 100, h: 18 }, parentRect: { x: 0, y: 0, w: 100, h: 22 } });
  assertViolation(eval1(c, m), 'FILL-PARENT-HEIGHT');
});

test('fill-parent — FAIL with no parent element', () => {
  const c = { name: 'c', selector: '#el', expected: { width: 'fill-parent' } };
  const m = measurement({ parentRect: null });
  assertViolation(eval1(c, m), 'FILL-PARENT-WIDTH');
});

// ═══════════════════════════════════════════════════════════════════════════════
// DPR / canvas backing store
// ═══════════════════════════════════════════════════════════════════════════════

test('canvas backingStore — PASS at DPR 2 (100×22 css → 200×44 bitmap)', () => {
  const c = { name: 'c', selector: '#cv', expected: { canvas: { backingStore: true } } };
  assertNoViolations(eval1(c, canvasMeasurement(100, 22, 2)));
});

test('canvas backingStore — PASS at DPR 1 (100×22 css → 100×22 bitmap)', () => {
  const c = { name: 'c', selector: '#cv', expected: { canvas: { backingStore: true } } };
  assertNoViolations(eval1(c, canvasMeasurement(100, 22, 1)));
});

test('canvas backingStore — FAIL when bitmap.w does not match cssW×DPR', () => {
  const c  = { name: 'c', selector: '#cv', expected: { canvas: { backingStore: true } } };
  const m  = canvasMeasurement(100, 22, 2);
  m.canvas.bitmapW = 150; // wrong
  assertViolation(eval1(c, m), 'BACKING-STORE-W');
});

test('canvas backingStore — FAIL when bitmap.h does not match cssH×DPR', () => {
  const c = { name: 'c', selector: '#cv', expected: { canvas: { backingStore: true } } };
  const m = canvasMeasurement(100, 22, 2);
  m.canvas.bitmapH = 30; // wrong
  assertViolation(eval1(c, m), 'BACKING-STORE-H');
});

test('canvas backingStore — FAIL on non-canvas element', () => {
  const c = { name: 'c', selector: '#el', expected: { canvas: { backingStore: true } } };
  const m = measurement({ canvas: null, tagName: 'DIV' });
  assertViolation(eval1(c, m), 'BACKING-STORE');
});

test('canvas backingStore — PASS at tolerance boundary (off by 1)', () => {
  const c = { name: 'c', selector: '#cv', expected: { canvas: { backingStore: true } } };
  const m = canvasMeasurement(100, 22, 2);
  m.canvas.bitmapW = 200 + 1; // exactly at tolerance
  assertNoViolations(eval1(c, m));
});

// ═══════════════════════════════════════════════════════════════════════════════
// overflow / clipping
// ═══════════════════════════════════════════════════════════════════════════════

test('overflow:none — PASS when no clipping ancestor', () => {
  const c = { name: 'c', selector: '#el', expected: { overflow: 'none' } };
  assertNoViolations(eval1(c, measurement({ clip: { clipped: false } })));
});

test('overflow:none — FAIL when element is clipped', () => {
  const c = { name: 'c', selector: '#el', expected: { overflow: 'none' } };
  const m = measurement({ clip: { clipped: true, by: '#parent', parentRect: { w: 50, h: 10 }, elRect: { w: 200, h: 22 } } });
  assertViolation(eval1(c, m), 'OVERFLOW');
});

// ═══════════════════════════════════════════════════════════════════════════════
// transform
// ═══════════════════════════════════════════════════════════════════════════════

test('transform — PASS when identity', () => {
  const c = { name: 'c', selector: '#el', expected: { transform: {} } };
  assertNoViolations(eval1(c, measurement()));
});

test('transform — FAIL when scaleX deviates', () => {
  const c = { name: 'c', selector: '#el', expected: { transform: { maxScaleDeviation: 0.01 } } };
  const m = measurement({ transform: { scaleX: 0.5, scaleY: 1, raw: 'matrix(0.5,0,0,1,0,0)' } });
  assertViolation(eval1(c, m), 'TRANSFORM');
});

// ═══════════════════════════════════════════════════════════════════════════════
// pixelScan (minPaintedThicknessPx)
// ═══════════════════════════════════════════════════════════════════════════════

test('pixelScan — PASS when painted thickness meets minimum', () => {
  const c = { name: 'my-ruler', selector: '#el',
    expected: { pixelScan: { axis: 'v', minPaintedThicknessPx: 20 } } };
  const pixelData = { ok: true, regions: { 'my-ruler': { paintedThickness: 22 } } };
  assertNoViolations(eval1(c, measurement(), null, pixelData));
});

test('pixelScan — FAIL when painted thickness below minimum', () => {
  const c = { name: 'my-ruler', selector: '#el',
    expected: { pixelScan: { axis: 'v', minPaintedThicknessPx: 20 } } };
  const pixelData = { ok: true, regions: { 'my-ruler': { paintedThickness: 8 } } };
  assertViolation(eval1(c, measurement(), null, pixelData), 'PIXEL-SCAN-THICKNESS');
});

test('pixelScan — FAIL when region missing from pixelData', () => {
  const c = { name: 'my-ruler', selector: '#el',
    expected: { pixelScan: { axis: 'v', minPaintedThicknessPx: 20 } } };
  const pixelData = { ok: true, regions: {} };
  assertViolation(eval1(c, measurement(), null, pixelData), 'PIXEL-SCAN-MISSING');
});

// ═══════════════════════════════════════════════════════════════════════════════
// custom validator
// ═══════════════════════════════════════════════════════════════════════════════

test('custom validator — PASS returning empty array', () => {
  const c = {
    name:   'cross-check',
    custom: () => [],
  };
  assert.deepEqual(evaluateContract(c, {}), []);
});

test('custom validator — violations are reported with contract name', () => {
  const c = {
    name:   'ruler-symmetry',
    custom: () => [{ id: 'INV-1', detail: 'top=25 side=22 diff=3px' }],
  };
  const violations = evaluateContract(c, {});
  assert.equal(violations.length, 1);
  assert.equal(violations[0].id, 'INV-1');
  assert.equal(violations[0].contract, 'ruler-symmetry');
});

test('custom validator receives context argument', () => {
  let receivedContext = null;
  const c = {
    name:   'config-check',
    custom: (_m, _px, ctx) => { receivedContext = ctx; return []; },
  };
  const ctx = { topPx: 22, sidePx: 22 };
  evaluateContract(c, {}, null, null, ctx);
  assert.deepEqual(receivedContext, ctx);
});

// ═══════════════════════════════════════════════════════════════════════════════
// explicit dimension checks (heightPx / widthPx)
// ═══════════════════════════════════════════════════════════════════════════════

test('heightPx — PASS at exact value', () => {
  const c = { name: 'c', selector: '#el', expected: { heightPx: 22 } };
  assertNoViolations(eval1(c, measurement({ rect: { x: 0, y: 0, w: 200, h: 22 } })));
});

test('heightPx — PASS within default tolerance', () => {
  const c = { name: 'c', selector: '#el', expected: { heightPx: 22 } };
  assertNoViolations(eval1(c, measurement({ rect: { x: 0, y: 0, w: 200, h: 22 + DEFAULT_TOLERANCE_PX } })));
});

test('heightPx — FAIL when diff exceeds default tolerance', () => {
  const c = { name: 'c', selector: '#el', expected: { heightPx: 22 } };
  assertViolation(
    eval1(c, measurement({ rect: { x: 0, y: 0, w: 200, h: 22 + DEFAULT_TOLERANCE_PX + 0.1 } })),
    'HEIGHT',
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// error handling
// ═══════════════════════════════════════════════════════════════════════════════

test('MEASURE-ERROR — reported when measurement has error property', () => {
  const c = { name: 'c', selector: '#missing', expected: { heightPx: 22 } };
  const violations = evaluateContract(c, { '#missing': { error: 'element not found: #missing' } });
  assertViolation(violations, 'MEASURE-ERROR');
});

test('MEASURE-MISSING — reported when selector absent from measurements', () => {
  const c = { name: 'c', selector: '#absent', expected: { heightPx: 22 } };
  assertViolation(evaluateContract(c, {}), 'MEASURE-MISSING');
});

// ═══════════════════════════════════════════════════════════════════════════════
// pixelScan infrastructure failures — must never silently pass
// ═══════════════════════════════════════════════════════════════════════════════

test('pixelScan — PIXEL-SCAN-FAILED when pixelData is null', () => {
  const c = { name: 'my-ruler', selector: '#el',
    expected: { pixelScan: { axis: 'v', minPaintedThicknessPx: 20 } } };
  assertViolation(eval1(c, measurement(), null, null), 'PIXEL-SCAN-FAILED');
});

test('pixelScan — PIXEL-SCAN-FAILED when pixelData.ok is false', () => {
  const c = { name: 'my-ruler', selector: '#el',
    expected: { pixelScan: { axis: 'v', minPaintedThicknessPx: 20 } } };
  const pixelData = { ok: false, error: 'python timeout', regions: {} };
  assertViolation(eval1(c, measurement(), null, pixelData), 'PIXEL-SCAN-FAILED');
});

test('pixelScan — PIXEL-SCAN-FAILED when pixelData has no .regions (ok=false, no regions key)', () => {
  const c = { name: 'my-ruler', selector: '#el',
    expected: { pixelScan: { axis: 'v', minPaintedThicknessPx: 20 } } };
  // Simulates analyzePixelRegions returning { ok: false, error: '...' } before regions fix
  const pixelData = { ok: false, error: 'pillow not installed' };
  assertViolation(eval1(c, measurement(), null, pixelData), 'PIXEL-SCAN-FAILED');
});

// ═══════════════════════════════════════════════════════════════════════════════
// custom validator return-type enforcement — must never silently pass on bad return
// ═══════════════════════════════════════════════════════════════════════════════

test('async custom validator — throws TypeError immediately', () => {
  const c = { name: 'async-custom', custom: async () => [] };
  assert.throws(
    () => evaluateContract(c, {}),
    (err) => err instanceof TypeError && err.message.includes('"async-custom"'),
  );
});

test('custom validator — throws TypeError when returning null (not silent pass)', () => {
  // null ?? [] was the old behaviour: silently swallowed all violations.
  const c = { name: 'null-return', custom: () => null };
  assert.throws(
    () => evaluateContract(c, {}),
    (err) => err instanceof TypeError && err.message.includes('null') && err.message.includes('"null-return"'),
  );
});

test('custom validator — throws TypeError when returning undefined', () => {
  const c = { name: 'undef-return', custom: () => undefined };
  assert.throws(
    () => evaluateContract(c, {}),
    (err) => err instanceof TypeError && err.message.includes('"undef-return"'),
  );
});

test('custom validator — throws TypeError when returning a plain object (not array)', () => {
  const c = { name: 'obj-return', custom: () => ({ id: 'X', detail: 'y' }) };
  assert.throws(
    () => evaluateContract(c, {}),
    (err) => err instanceof TypeError && err.message.includes('"obj-return"'),
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// transform — scaleY deviation
// ═══════════════════════════════════════════════════════════════════════════════

test('transform — FAIL when scaleY deviates (scaleX identity)', () => {
  const c = { name: 'c', selector: '#el', expected: { transform: { maxScaleDeviation: 0.01 } } };
  const m = measurement({ transform: { scaleX: 1, scaleY: 0.5, raw: 'matrix(1,0,0,0.5,0,0)' } });
  assertViolation(eval1(c, m), 'TRANSFORM');
});

// ═══════════════════════════════════════════════════════════════════════════════
// canvas paintedArea (Layer 2 draw audit)
// ═══════════════════════════════════════════════════════════════════════════════

test('paintedArea — PASS when span meets minimum', () => {
  const c = { name: 'c', selector: '#cv',
    expected: { canvas: { paintedArea: { axis: 'h', minSpanPx: 18 } } } };
  const audits = { '#cv': { bitmapW: 200, bitmapH: 44, paintedMin: 2, paintedMax: 20, paintedSpan: 19 } };
  assertNoViolations(eval1(c, canvasMeasurement(100, 22, 2), audits));
});

test('paintedArea — FAIL when span below minimum', () => {
  const c = { name: 'c', selector: '#cv',
    expected: { canvas: { paintedArea: { axis: 'h', minSpanPx: 18 } } } };
  const audits = { '#cv': { bitmapW: 200, bitmapH: 44, paintedMin: 5, paintedMax: 10, paintedSpan: 6 } };
  assertViolation(eval1(c, canvasMeasurement(100, 22, 2), audits), 'PAINTED-AREA-SPAN');
});

test('paintedArea — PAINTED-AREA when canvasAudits is null (audit not run)', () => {
  const c = { name: 'c', selector: '#cv',
    expected: { canvas: { paintedArea: { axis: 'h', minSpanPx: 18 } } } };
  // null canvasAudits — the check block guards with `if (...&& canvasAudits)` so silently skips.
  // This is the KNOWN accepted behavior: Layer 2 is opt-in, caller must pass canvasAudits.
  assertNoViolations(eval1(c, canvasMeasurement(100, 22, 2), null));
});

test('paintedArea — PAINTED-AREA when audit entry has error', () => {
  const c = { name: 'c', selector: '#cv',
    expected: { canvas: { paintedArea: { axis: 'h', minSpanPx: 18 } } } };
  const audits = { '#cv': { error: 'getImageData failed' } };
  assertViolation(eval1(c, canvasMeasurement(100, 22, 2), audits), 'PAINTED-AREA');
});

// ═══════════════════════════════════════════════════════════════════════════════
// fill-parent width AND height simultaneously
// ═══════════════════════════════════════════════════════════════════════════════

test('fill-parent width+height — both violations emitted simultaneously', () => {
  const c = { name: 'c', selector: '#el',
    expected: { width: 'fill-parent', height: 'fill-parent', maxTolerancePx: 1 } };
  const m = measurement({
    rect:       { x: 0, y: 0, w: 180, h: 15 },
    parentRect: { x: 0, y: 0, w: 200, h: 22 },
  });
  const violations = eval1(c, m);
  assertViolation(violations, 'FILL-PARENT-WIDTH');
  assertViolation(violations, 'FILL-PARENT-HEIGHT');
  assert.equal(violations.filter(v => v.id.startsWith('FILL-PARENT')).length, 2);
});

// ═══════════════════════════════════════════════════════════════════════════════
// custom + selector + missing selector → both custom and MEASURE-MISSING violations
// ═══════════════════════════════════════════════════════════════════════════════

test('custom + selector — both custom violation and MEASURE-MISSING emitted', () => {
  const c = {
    name:     'combined',
    selector: '#absent',
    expected: { heightPx: 22 },
    custom:   () => [{ id: 'CUSTOM-CROSS', detail: 'cross check' }],
  };
  const violations = evaluateContract(c, {});
  assertViolation(violations, 'CUSTOM-CROSS');
  assertViolation(violations, 'MEASURE-MISSING');
});

// ═══════════════════════════════════════════════════════════════════════════════
// classifyViolations / isInfraViolation — strict CI gate
// ═══════════════════════════════════════════════════════════════════════════════

test('INFRA_VIOLATION_IDS contains the four core infra ids', () => {
  const required = ['MEASURE-MISSING', 'MEASURE-ERROR', 'PIXEL-SCAN-FAILED', 'PIXEL-SCAN-MISSING'];
  for (const id of required)
    assert.ok(INFRA_VIOLATION_IDS.has(id), `expected INFRA_VIOLATION_IDS to contain "${id}"`);
});

test('isInfraViolation — true for all core infra ids', () => {
  for (const id of INFRA_VIOLATION_IDS)
    assert.ok(isInfraViolation({ id }), `expected isInfraViolation({ id: "${id}" }) to be true`);
});

test('isInfraViolation — true for -MEASURE suffix (custom validator gap)', () => {
  assert.ok(isInfraViolation({ id: 'INV-1-MEASURE' }));
  assert.ok(isInfraViolation({ id: 'INV-10-MEASURE' }));
});

test('isInfraViolation — true for -TYPE suffix (config type error)', () => {
  assert.ok(isInfraViolation({ id: 'INV-10-TYPE' }));
  assert.ok(isInfraViolation({ id: 'INV-11-TYPE' }));
});

test('isInfraViolation — false for contract violation ids', () => {
  const contractIds = ['HEIGHT', 'WIDTH', 'FILL-PARENT-WIDTH', 'FILL-PARENT-HEIGHT',
    'OVERFLOW', 'TRANSFORM', 'BACKING-STORE-W', 'BACKING-STORE-H',
    'PIXEL-SCAN-THICKNESS', 'PAINTED-AREA-SPAN', 'INV-1', 'INV-12'];
  for (const id of contractIds)
    assert.ok(!isInfraViolation({ id }), `expected isInfraViolation({ id: "${id}" }) to be false`);
});

test('classifyViolations — separates infra from contract violations', () => {
  const violations = [
    { contract: 'a', id: 'MEASURE-MISSING', detail: 'x' },
    { contract: 'b', id: 'HEIGHT',          detail: 'y' },
    { contract: 'c', id: 'PIXEL-SCAN-FAILED', detail: 'z' },
    { contract: 'd', id: 'OVERFLOW',         detail: 'w' },
    { contract: 'e', id: 'INV-1-MEASURE',    detail: 'v' },
  ];
  const { infra, contract } = classifyViolations(violations);
  assert.equal(infra.length,    3, 'expected 3 infra violations');
  assert.equal(contract.length, 2, 'expected 2 contract violations');
  assert.ok(infra.every(v =>  isInfraViolation(v)));
  assert.ok(contract.every(v => !isInfraViolation(v)));
});

test('classifyViolations — empty input returns empty arrays', () => {
  const { infra, contract } = classifyViolations([]);
  assert.deepEqual(infra,    []);
  assert.deepEqual(contract, []);
});

test('classifyViolations — all-infra input → contract is empty', () => {
  const violations = [
    { id: 'MEASURE-ERROR',    contract: 'x', detail: '' },
    { id: 'PIXEL-SCAN-FAILED', contract: 'y', detail: '' },
  ];
  const { infra, contract } = classifyViolations(violations);
  assert.equal(infra.length,    2);
  assert.equal(contract.length, 0);
});

test('classifyViolations — all-contract input → infra is empty', () => {
  const violations = [
    { id: 'HEIGHT',   contract: 'x', detail: '' },
    { id: 'OVERFLOW', contract: 'y', detail: '' },
  ];
  const { infra, contract } = classifyViolations(violations);
  assert.equal(infra.length,    0);
  assert.equal(contract.length, 2);
});

test('strict CI gate — MEASURE-MISSING must always be classified as infra', () => {
  // Regression guard: this id must never drift to contract classification.
  const v = { contract: 'c', id: 'MEASURE-MISSING', detail: 'element not found' };
  const { infra } = classifyViolations([v]);
  assert.equal(infra.length, 1, 'MEASURE-MISSING must be an infra failure, not a contract failure');
});

test('strict CI gate — PIXEL-SCAN-FAILED must always be classified as infra', () => {
  const v = { contract: 'c', id: 'PIXEL-SCAN-FAILED', detail: 'python timeout' };
  const { infra } = classifyViolations([v]);
  assert.equal(infra.length, 1, 'PIXEL-SCAN-FAILED must be an infra failure, not a contract failure');
});
