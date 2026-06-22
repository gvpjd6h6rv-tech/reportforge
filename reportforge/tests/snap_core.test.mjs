'use strict';
/**
 * SS-12 snap — SnapCore.js snap math contracts
 *
 * Migrated in P16B to load SnapCore.js directly via require() instead of
 * through the SnapEngine.js facade. SnapCore.js is the real, live snap-math
 * implementation — engines/DragEngine.js and engines/RuntimeBootstrap.js call
 * SnapCore.snapValue(v, grid, enabled) directly; SnapEngine.js has zero
 * production callers (confirmed in P16A) and is pending retirement.
 *
 * SnapCore.js is pure — no instance state, grid/enabled are passed as
 * explicit parameters — so plain require() is safe (no isolation concerns,
 * unlike SnapState.js).
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SnapCore = require('../../engines/SnapCore.js');

// ── snapValue (grid=4) ──────────────────────────────────────────────────────

test('snapValue — rounds to nearest grid multiple (grid=4)', () => {
  assert.equal(SnapCore.snapValue(0,  4, true), 0);   // on grid
  assert.equal(SnapCore.snapValue(4,  4, true), 4);   // on grid
  assert.equal(SnapCore.snapValue(8,  4, true), 8);   // on grid
  assert.equal(SnapCore.snapValue(3,  4, true), 4);   // 3 → nearest is 4
  assert.equal(SnapCore.snapValue(1,  4, true), 0);   // 1 → nearest is 0
  assert.equal(SnapCore.snapValue(6,  4, true), 8);   // 6 → 8 (0.5 rounds up)
  assert.equal(SnapCore.snapValue(5,  4, true), 4);   // 5 → nearest is 4
  assert.equal(SnapCore.snapValue(7,  4, true), 8);   // 7 → nearest is 8
});

test('snapValue — rounds to nearest grid multiple (grid=10)', () => {
  assert.equal(SnapCore.snapValue(9.7, 10, true), 10); // 9.7 → 10
  assert.equal(SnapCore.snapValue(4,   10, true), 0);  // 4 → 0
  assert.equal(SnapCore.snapValue(50,  10, true), 50); // already aligned
  assert.equal(SnapCore.snapValue(15,  10, true), 20); // 15 → 20 (0.5 rounds up)
});

test('snapValue — disabled returns value unchanged', () => {
  assert.equal(SnapCore.snapValue(9,   4,  false), 9);
  assert.equal(SnapCore.snapValue(3,   4,  false), 3);
  assert.equal(SnapCore.snapValue(9.7, 10, false), 9.7);
});

test('snapValue — negative values snap correctly', () => {
  assert.equal(SnapCore.snapValue(-5, 4, true), -4); // -5 → -4 (closer)
  assert.equal(SnapCore.snapValue(-3, 4, true), -4); // -3 → -4 (closer)
  assert.equal(SnapCore.snapValue(-4, 4, true), -4); // on grid
  assert.equal(SnapCore.snapValue(-8, 4, true), -8); // on grid
  // Avoid -1 and -2: Math.round(-0.25/-0.5) produce -0 in V8 (strict !== 0)
});

// ── snapPoint ────────────────────────────────────────────────────────────────

test('snapPoint — snaps both coordinates (grid=4)', () => {
  const pt = SnapCore.snapPoint(3, 7, 4, true);
  assert.equal(pt.x, 4);   // 3 → 4
  assert.equal(pt.y, 8);   // 7 → 8
});

test('snapPoint — disabled passes through unchanged', () => {
  const pt = SnapCore.snapPoint(3, 7, 4, false);
  assert.equal(pt.x, 3);
  assert.equal(pt.y, 7);
});

test('snapPoint — already-aligned coordinates unchanged', () => {
  const pt = SnapCore.snapPoint(8, 12, 4, true);
  assert.equal(pt.x, 8);
  assert.equal(pt.y, 12);
});
