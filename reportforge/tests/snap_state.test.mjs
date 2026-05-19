'use strict';
/**
 * SS-12 snap — SnapState unit tests
 * State lifecycle: enable/disable/toggle/grid — no DOM, no globals required.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadSnapState() {
  const src = fs.readFileSync(resolve(ROOT, 'engines/SnapState.js'), 'utf8');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

// ── defaults ─────────────────────────────────────────────────────────────────

test('SnapState — default state: enabled=true, grid=4', () => {
  const S = loadSnapState();
  assert.equal(S.isEnabled(), true);
  assert.equal(S.getGrid(), 4);
});

// ── setEnabled ───────────────────────────────────────────────────────────────

test('SnapState.setEnabled(false) — isEnabled returns false', () => {
  const S = loadSnapState();
  S.setEnabled(false);
  assert.equal(S.isEnabled(), false);
});

test('SnapState.setEnabled(true) — isEnabled returns true', () => {
  const S = loadSnapState();
  S.setEnabled(false);
  S.setEnabled(true);
  assert.equal(S.isEnabled(), true);
});

test('SnapState.setEnabled — coerces truthy/falsy values', () => {
  const S = loadSnapState();
  S.setEnabled(0);
  assert.equal(S.isEnabled(), false);
  S.setEnabled(1);
  assert.equal(S.isEnabled(), true);
  S.setEnabled('');
  assert.equal(S.isEnabled(), false);
});

// ── toggle ───────────────────────────────────────────────────────────────────

test('SnapState.toggle — flips enabled state', () => {
  const S = loadSnapState();
  assert.equal(S.isEnabled(), true);
  S.toggle();
  assert.equal(S.isEnabled(), false);
  S.toggle();
  assert.equal(S.isEnabled(), true);
});

// ── setGrid ──────────────────────────────────────────────────────────────────

test('SnapState.setGrid — updates grid value', () => {
  const S = loadSnapState();
  S.setGrid(8);
  assert.equal(S.getGrid(), 8);
});

test('SnapState.setGrid(0) — clamps to minimum 1', () => {
  const S = loadSnapState();
  S.setGrid(0);
  assert.equal(S.getGrid(), 1);
});

test('SnapState.setGrid(-4) — clamps to minimum 1', () => {
  const S = loadSnapState();
  S.setGrid(-4);
  assert.equal(S.getGrid(), 1);
});

test('SnapState.setGrid — multiple values persist last write', () => {
  const S = loadSnapState();
  S.setGrid(4);
  S.setGrid(10);
  S.setGrid(2);
  assert.equal(S.getGrid(), 2);
});

// ── isolation ────────────────────────────────────────────────────────────────

test('SnapState instances are isolated (each loadSnapState is fresh)', () => {
  const A = loadSnapState();
  const B = loadSnapState();
  A.setEnabled(false);
  A.setGrid(16);
  // B must be unaffected because each vm context is isolated
  assert.equal(B.isEnabled(), true);
  assert.equal(B.getGrid(), 4);
});
