'use strict';
/**
 * SS-12 snap — SnapCore unit tests
 * Pure math: snapValue and snapPoint — no DOM, no globals required.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadSnapCore() {
  const src = fs.readFileSync(resolve(ROOT, 'engines/SnapCore.js'), 'utf8');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

// ── snapValue ─────────────────────────────────────────────────────────────────

test('SnapCore.snapValue — rounds to nearest grid multiple (grid=4)', () => {
  const SC = loadSnapCore();
  assert.equal(SC.snapValue(0,  4, true),  0);   // on grid
  assert.equal(SC.snapValue(4,  4, true),  4);   // on grid
  assert.equal(SC.snapValue(8,  4, true),  8);   // on grid
  assert.equal(SC.snapValue(3,  4, true),  4);   // 3 → nearest is 4
  assert.equal(SC.snapValue(1,  4, true),  0);   // 1 → nearest is 0
  assert.equal(SC.snapValue(6,  4, true),  8);   // 6 → nearest is 8 (0.5 rounds up)
  assert.equal(SC.snapValue(5,  4, true),  4);   // 5 → nearest is 4
  assert.equal(SC.snapValue(7,  4, true),  8);   // 7 → nearest is 8
});

test('SnapCore.snapValue — rounds to nearest grid multiple (grid=10)', () => {
  const SC = loadSnapCore();
  assert.equal(SC.snapValue(9.7, 10, true), 10);  // 9.7 → 10
  assert.equal(SC.snapValue(4,   10, true),  0);  // 4 → 0
  assert.equal(SC.snapValue(50,  10, true), 50);  // already aligned
  assert.equal(SC.snapValue(15,  10, true), 20);  // 15 → 20 (0.5 rounds up)
});

test('SnapCore.snapValue — disabled returns value unchanged', () => {
  const SC = loadSnapCore();
  assert.equal(SC.snapValue(9,   4, false), 9);
  assert.equal(SC.snapValue(9.7, 10, false), 9.7);
  assert.equal(SC.snapValue(3,   4, false), 3);
});

test('SnapCore.snapValue — grid=0 or negative returns value unchanged', () => {
  const SC = loadSnapCore();
  assert.equal(SC.snapValue(9, 0,  true), 9);
  assert.equal(SC.snapValue(9, -4, true), 9);
});

test('SnapCore.snapValue — negative values snap correctly', () => {
  const SC = loadSnapCore();
  assert.equal(SC.snapValue(-5,  4, true), -4);  // -5 → -4 (closer)
  assert.equal(SC.snapValue(-3,  4, true), -4);  // -3 → -4 (closer)
  assert.equal(SC.snapValue(-4,  4, true), -4);  // on grid
  assert.equal(SC.snapValue(-8,  4, true), -8);  // on grid
  // Avoid -1 and -2: Math.round(-0.25) and Math.round(-0.5) produce -0 in V8
});

// ── snapPoint ────────────────────────────────────────────────────────────────

test('SnapCore.snapPoint — snaps both coordinates', () => {
  const SC = loadSnapCore();
  const pt = SC.snapPoint(3, 7, 4, true);
  assert.equal(pt.x, 4);   // 3 → 4
  assert.equal(pt.y, 8);   // 7 → 8
});

test('SnapCore.snapPoint — disabled passes through unchanged', () => {
  const SC = loadSnapCore();
  const pt = SC.snapPoint(3, 7, 4, false);
  assert.equal(pt.x, 3);
  assert.equal(pt.y, 7);
});

test('SnapCore.snapPoint — already-aligned coordinates unchanged', () => {
  const SC = loadSnapCore();
  const pt = SC.snapPoint(8, 12, 4, true);
  assert.equal(pt.x, 8);
  assert.equal(pt.y, 12);
});
