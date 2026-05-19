'use strict';
/**
 * SS-12 snap — snap state contracts (via SnapEngine facade)
 * Tests the same state lifecycle contracts previously in SnapState.
 * SnapState.js moved to sharedFiles — contracts verified through SnapEngine API.
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

// ── defaults ─────────────────────────────────────────────────────────────────

test('snap state — default: enabled=true, grid=4', () => {
  const E = loadSnap();
  assert.equal(E.isEnabled(), true);
  assert.equal(E.getGrid(), 4);
});

// ── setEnabled ───────────────────────────────────────────────────────────────

test('snap state — setEnabled(false): isEnabled returns false', () => {
  const E = loadSnap();
  E.setEnabled(false);
  assert.equal(E.isEnabled(), false);
});

test('snap state — setEnabled(true): isEnabled returns true', () => {
  const E = loadSnap();
  E.setEnabled(false);
  E.setEnabled(true);
  assert.equal(E.isEnabled(), true);
});

test('snap state — setEnabled coerces truthy/falsy values', () => {
  const E = loadSnap();
  E.setEnabled(0);
  assert.equal(E.isEnabled(), false);
  E.setEnabled(1);
  assert.equal(E.isEnabled(), true);
  E.setEnabled('');
  assert.equal(E.isEnabled(), false);
});

// ── toggle ───────────────────────────────────────────────────────────────────

test('snap state — toggle flips enabled state', () => {
  const E = loadSnap();
  assert.equal(E.isEnabled(), true);
  E.toggle();
  assert.equal(E.isEnabled(), false);
  E.toggle();
  assert.equal(E.isEnabled(), true);
});

// ── setGrid ──────────────────────────────────────────────────────────────────

test('snap state — setGrid updates grid value', () => {
  const E = loadSnap();
  E.setGrid(8);
  assert.equal(E.getGrid(), 8);
});

test('snap state — setGrid(0) clamps to minimum 1', () => {
  const E = loadSnap();
  E.setGrid(0);
  assert.equal(E.getGrid(), 1);
});

test('snap state — setGrid(-4) clamps to minimum 1', () => {
  const E = loadSnap();
  E.setGrid(-4);
  assert.equal(E.getGrid(), 1);
});

test('snap state — setGrid multiple writes, last wins', () => {
  const E = loadSnap();
  E.setGrid(4);
  E.setGrid(10);
  E.setGrid(2);
  assert.equal(E.getGrid(), 2);
});

// ── isolation ────────────────────────────────────────────────────────────────

test('snap state — instances are isolated (each loadSnap is a fresh vm context)', () => {
  const A = loadSnap();
  const B = loadSnap();
  A.setEnabled(false);
  A.setGrid(16);
  assert.equal(B.isEnabled(), true);
  assert.equal(B.getGrid(), 4);
});
