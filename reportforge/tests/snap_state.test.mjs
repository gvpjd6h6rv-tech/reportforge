'use strict';
/**
 * SS-12 snap — SnapState.js state lifecycle contracts
 *
 * Migrated in P16B to load SnapState.js directly instead of through the
 * SnapEngine.js facade. SnapState.js is the real, live state module —
 * engines/DragEngine.js, RuntimeBootstrap.js, and KeyboardEngine.js call
 * SnapState.getGrid()/isEnabled()/toggle() directly; SnapEngine.js has zero
 * production callers (confirmed in P16A) and is pending retirement.
 *
 * SnapState.js is a mutable singleton (module-level _gridModel/_enabled).
 * require() would cache it across tests, breaking the isolation contract
 * this suite verifies — so each test loads a fresh vm context, same
 * isolation guarantee the original SnapEngine-facade tests relied on.
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

test('SnapState — default: enabled=true, grid=4', () => {
  const S = loadSnapState();
  assert.equal(S.isEnabled(), true);
  assert.equal(S.getGrid(), 4);
});

// ── setEnabled ───────────────────────────────────────────────────────────────

test('SnapState — setEnabled(false): isEnabled returns false', () => {
  const S = loadSnapState();
  S.setEnabled(false);
  assert.equal(S.isEnabled(), false);
});

test('SnapState — setEnabled(true): isEnabled returns true', () => {
  const S = loadSnapState();
  S.setEnabled(false);
  S.setEnabled(true);
  assert.equal(S.isEnabled(), true);
});

test('SnapState — setEnabled coerces truthy/falsy values', () => {
  const S = loadSnapState();
  S.setEnabled(0);
  assert.equal(S.isEnabled(), false);
  S.setEnabled(1);
  assert.equal(S.isEnabled(), true);
  S.setEnabled('');
  assert.equal(S.isEnabled(), false);
});

// ── toggle ───────────────────────────────────────────────────────────────────

test('SnapState — toggle flips enabled state', () => {
  const S = loadSnapState();
  assert.equal(S.isEnabled(), true);
  S.toggle();
  assert.equal(S.isEnabled(), false);
  S.toggle();
  assert.equal(S.isEnabled(), true);
});

// ── setGrid ──────────────────────────────────────────────────────────────────

test('SnapState — setGrid updates grid value', () => {
  const S = loadSnapState();
  S.setGrid(8);
  assert.equal(S.getGrid(), 8);
});

test('SnapState — setGrid(0) clamps to minimum 1', () => {
  const S = loadSnapState();
  S.setGrid(0);
  assert.equal(S.getGrid(), 1);
});

test('SnapState — setGrid(-4) clamps to minimum 1', () => {
  const S = loadSnapState();
  S.setGrid(-4);
  assert.equal(S.getGrid(), 1);
});

test('SnapState — setGrid multiple writes, last wins', () => {
  const S = loadSnapState();
  S.setGrid(4);
  S.setGrid(10);
  S.setGrid(2);
  assert.equal(S.getGrid(), 2);
});

// ── isolation ────────────────────────────────────────────────────────────────

test('SnapState — instances are isolated (each loadSnapState is a fresh vm context)', () => {
  const A = loadSnapState();
  const B = loadSnapState();
  A.setEnabled(false);
  A.setGrid(16);
  assert.equal(B.isEnabled(), true);
  assert.equal(B.getGrid(), 4);
});
