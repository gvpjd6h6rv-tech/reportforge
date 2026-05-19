'use strict';
/**
 * SS-12 snap — SnapEngine integration tests
 * Tests the public API of SnapEngine: snap, snapPoint, enable/disable,
 * setGrid, getAlignmentGuides, and legacySnap compat shim.
 * No DOM. No Playwright. SnapEngine uses window.SnapEngine = ... so
 * we provide a mock window in the vm context.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadSnapEngine() {
  const src = fs.readFileSync(resolve(ROOT, 'engines/SnapEngine.js'), 'utf8');
  // SnapEngine assigns to window.SnapEngine — provide mock window in context.
  const ctx = { window: {}, module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;  // module.exports = window.SnapEngine
}

// ── snap (model-space scalar) ────────────────────────────────────────────────

test('SnapEngine.snap — already-aligned value unchanged', () => {
  const E = loadSnapEngine();
  assert.equal(E.snap(0),  0);
  assert.equal(E.snap(4),  4);
  assert.equal(E.snap(8),  8);
  assert.equal(E.snap(12), 12);
});

test('SnapEngine.snap — rounds to nearest grid step (grid=4)', () => {
  const E = loadSnapEngine();
  assert.equal(E.snap(3),  4);   // 3 → 4
  assert.equal(E.snap(1),  0);   // 1 → 0
  assert.equal(E.snap(7),  8);   // 7 → 8
  assert.equal(E.snap(5),  4);   // 5 → 4
  assert.equal(E.snap(9),  8);   // 9 → 8
  assert.equal(E.snap(11), 12);  // 11 → 12
});

test('SnapEngine.snap — disabled returns value unchanged', () => {
  const E = loadSnapEngine();
  E.setEnabled(false);
  assert.equal(E.snap(3),   3);
  assert.equal(E.snap(9.7), 9.7);
  assert.equal(E.snap(1),   1);
});

test('SnapEngine.snap — re-enable restores snapping', () => {
  const E = loadSnapEngine();
  E.setEnabled(false);
  E.setEnabled(true);
  assert.equal(E.snap(3), 4);
});

// ── setGrid ──────────────────────────────────────────────────────────────────

test('SnapEngine.setGrid / getGrid — round-trip', () => {
  const E = loadSnapEngine();
  E.setGrid(10);
  assert.equal(E.getGrid(), 10);
});

test('SnapEngine.setGrid(10) — snap uses new grid', () => {
  const E = loadSnapEngine();
  E.setGrid(10);
  assert.equal(E.snap(9.7), 10);
  assert.equal(E.snap(4),    0);
  assert.equal(E.snap(50),  50);
});

test('SnapEngine.setGrid(1) — snaps to integer', () => {
  const E = loadSnapEngine();
  E.setGrid(1);
  assert.equal(E.snap(9.7), 10);
  assert.equal(E.snap(3.2),  3);
});

test('SnapEngine.setGrid(0) — clamps to 1, does not return unsnapped', () => {
  const E = loadSnapEngine();
  E.setGrid(0);
  assert.equal(E.getGrid(), 1);
});

// ── isEnabled / toggle ───────────────────────────────────────────────────────

test('SnapEngine — default isEnabled() = true', () => {
  const E = loadSnapEngine();
  assert.equal(E.isEnabled(), true);
});

test('SnapEngine.toggle — flips enabled flag', () => {
  const E = loadSnapEngine();
  assert.equal(E.isEnabled(), true);
  E.toggle();
  assert.equal(E.isEnabled(), false);
  E.toggle();
  assert.equal(E.isEnabled(), true);
});

// ── snapPoint ────────────────────────────────────────────────────────────────

test('SnapEngine.snapPoint — snaps both axes', () => {
  const E = loadSnapEngine();
  const pt = E.snapPoint(3, 7);
  assert.equal(pt.x, 4);
  assert.equal(pt.y, 8);
});

test('SnapEngine.snapPoint — disabled passthrough', () => {
  const E = loadSnapEngine();
  E.setEnabled(false);
  const pt = E.snapPoint(3, 7);
  assert.equal(pt.x, 3);
  assert.equal(pt.y, 7);
});

// ── legacySnap shim ───────────────────────────────────────────────────────────

test('SnapEngine.legacySnap — same result as snap', () => {
  const E = loadSnapEngine();
  assert.equal(E.legacySnap(3),  E.snap(3));
  assert.equal(E.legacySnap(9),  E.snap(9));
  assert.equal(E.legacySnap(11), E.snap(11));
});

test('SnapEngine.legacySnap — respects setEnabled(false)', () => {
  const E = loadSnapEngine();
  E.setEnabled(false);
  assert.equal(E.legacySnap(3), 3);
});

// ── getAlignmentGuides (without DS) ──────────────────────────────────────────

test('SnapEngine.getAlignmentGuides — returns [] when DS is undefined', () => {
  const E = loadSnapEngine();
  // No DS in vm context → typeof DS === 'undefined' guard triggers
  const guides = E.getAlignmentGuides({ id: 'e1', x: 10, y: 10, w: 50, h: 20, sectionId: 's1' });
  assert.ok(Array.isArray(guides));
  assert.equal(guides.length, 0);
});

// ── negative values ───────────────────────────────────────────────────────────

test('SnapEngine.snap — negative values snap correctly', () => {
  const E = loadSnapEngine();
  assert.equal(E.snap(-4), -4);  // on grid
  assert.equal(E.snap(-5), -4);  // -5 → -4 (closer)
  assert.equal(E.snap(-3), -4);  // -3 → -4 (closer)
  assert.equal(E.snap(-8), -8);  // on grid
  // Avoid -1 and -2: Math.round(-0.25/-0.5) produce -0 in V8 (strict !== 0)
});

// ── instance isolation ────────────────────────────────────────────────────────

test('SnapEngine instances are isolated (each load is a fresh vm context)', () => {
  const A = loadSnapEngine();
  const B = loadSnapEngine();
  A.setEnabled(false);
  A.setGrid(10);
  assert.equal(B.isEnabled(), true);
  assert.equal(B.getGrid(), 4);
});
