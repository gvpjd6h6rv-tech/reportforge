'use strict';
/**
 * SS-12 snap — snap math contracts (via SnapEngine facade)
 * Tests the same core snap/snapPoint math contracts previously in SnapCore.
 * SnapCore.js moved to sharedFiles — contracts verified through SnapEngine API.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadSnap() {
  const src = fs.readFileSync(resolve(ROOT, 'engines/SnapEngine.js'), 'utf8');
  const ctx = { window: {}, module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

// ── snap math (grid=4) ────────────────────────────────────────────────────────

test('snap math — rounds to nearest grid multiple (grid=4)', () => {
  const E = loadSnap();
  E.setGrid(4); E.setEnabled(true);
  assert.equal(E.snap(0),  0);   // on grid
  assert.equal(E.snap(4),  4);   // on grid
  assert.equal(E.snap(8),  8);   // on grid
  assert.equal(E.snap(3),  4);   // 3 → nearest is 4
  assert.equal(E.snap(1),  0);   // 1 → nearest is 0
  assert.equal(E.snap(6),  8);   // 6 → 8 (0.5 rounds up)
  assert.equal(E.snap(5),  4);   // 5 → nearest is 4
  assert.equal(E.snap(7),  8);   // 7 → nearest is 8
});

test('snap math — rounds to nearest grid multiple (grid=10)', () => {
  const E = loadSnap();
  E.setGrid(10); E.setEnabled(true);
  assert.equal(E.snap(9.7), 10);  // 9.7 → 10
  assert.equal(E.snap(4),    0);  // 4 → 0
  assert.equal(E.snap(50),  50);  // already aligned
  assert.equal(E.snap(15),  20);  // 15 → 20 (0.5 rounds up)
});

test('snap math — disabled returns value unchanged', () => {
  const E = loadSnap();
  E.setGrid(4); E.setEnabled(false);
  assert.equal(E.snap(9),   9);
  assert.equal(E.snap(3),   3);
  E.setGrid(10);
  assert.equal(E.snap(9.7), 9.7);
});

test('snap math — negative values snap correctly', () => {
  const E = loadSnap();
  E.setGrid(4); E.setEnabled(true);
  assert.equal(E.snap(-5), -4);  // -5 → -4 (closer)
  assert.equal(E.snap(-3), -4);  // -3 → -4 (closer)
  assert.equal(E.snap(-4), -4);  // on grid
  assert.equal(E.snap(-8), -8);  // on grid
  // Avoid -1 and -2: Math.round(-0.25/-0.5) produce -0 in V8 (strict !== 0)
});

// ── snapPoint ────────────────────────────────────────────────────────────────

test('snapPoint — snaps both coordinates (grid=4)', () => {
  const E = loadSnap();
  E.setGrid(4); E.setEnabled(true);
  const pt = E.snapPoint(3, 7);
  assert.equal(pt.x, 4);   // 3 → 4
  assert.equal(pt.y, 8);   // 7 → 8
});

test('snapPoint — disabled passes through unchanged', () => {
  const E = loadSnap();
  E.setGrid(4); E.setEnabled(false);
  const pt = E.snapPoint(3, 7);
  assert.equal(pt.x, 3);
  assert.equal(pt.y, 7);
});

test('snapPoint — already-aligned coordinates unchanged', () => {
  const E = loadSnap();
  E.setGrid(4); E.setEnabled(true);
  const pt = E.snapPoint(8, 12);
  assert.equal(pt.x, 8);
  assert.equal(pt.y, 12);
});
