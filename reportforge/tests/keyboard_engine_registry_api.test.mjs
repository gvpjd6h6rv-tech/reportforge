'use strict';
/**
 * keyboard_engine_registry_api.test.mjs — P31C closure #2
 *
 * KeyboardRegistry.js / KeyboardCombo.js were retired in P31B — both
 * confirmed zombies (never loaded by any designer/*.html <script> tag;
 * KeyboardEngine.js's inline handler registry was always the real, only
 * implementation in production, with confirmed identical API). Re-grep
 * confirms (P31C) zero external consumer anywhere references
 * KeyboardEngine.registry.* besides this test and
 * keyboard_engine_select_all.test.mjs's incidental use of .trigger().
 *
 * This locks in the external contract of KeyboardEngine.registry — the
 * register/off/get/trigger/clear API any future external consumer would
 * rely on — as a regression guard independent of internal implementation.
 * If KeyboardEngine ever swaps its inline registry for a real delegate
 * again, this test must keep passing unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(resolve(ROOT, 'engines/KeyboardEngine.js'), 'utf8');

function loadKeyboardEngine() {
  const ctx = {
    document: { addEventListener() {}, activeElement: null },
    module: { exports: {} },
    console,
  };
  vm.runInNewContext(SRC, ctx);
  return ctx.module.exports;
}

test('KeyboardEngine.registry exposes register/off/get/trigger/clear — the full external contract', () => {
  const KE = loadKeyboardEngine();
  const R = KE.registry;
  assert.equal(typeof R.register, 'function');
  assert.equal(typeof R.off, 'function');
  assert.equal(typeof R.get, 'function');
  assert.equal(typeof R.trigger, 'function');
  assert.equal(typeof R.clear, 'function');
});

test('registry.register + .get — handler is retrievable after registration', () => {
  const KE = loadKeyboardEngine();
  const fn = () => {};
  KE.registry.register('ctrl+z', fn);
  assert.equal(KE.registry.get('ctrl+z'), fn);
  KE.registry.clear();
});

test('registry.trigger — calls the registered handler and returns true; returns false when unregistered', () => {
  const KE = loadKeyboardEngine();
  let called = false;
  KE.registry.register('ctrl+b', () => { called = true; });
  assert.equal(KE.registry.trigger('ctrl+b', {}), true);
  assert.equal(called, true);
  assert.equal(KE.registry.trigger('ctrl+unregistered', {}), false);
  KE.registry.clear();
});

test('registry.off — removes a handler; .get returns null afterward', () => {
  const KE = loadKeyboardEngine();
  KE.registry.register('ctrl+y', () => {});
  KE.registry.off('ctrl+y');
  assert.equal(KE.registry.get('ctrl+y'), null);
});

test('registry.clear — removes every registered handler', () => {
  const KE = loadKeyboardEngine();
  KE.registry.register('ctrl+a', () => {});
  KE.registry.register('ctrl+b', () => {});
  KE.registry.clear();
  assert.equal(KE.registry.get('ctrl+a'), null);
  assert.equal(KE.registry.get('ctrl+b'), null);
});

test('two independent KeyboardEngine loads do not share registry state (no module-level leakage)', () => {
  const KE1 = loadKeyboardEngine();
  const KE2 = loadKeyboardEngine();
  KE1.registry.register('ctrl+z', () => {});
  assert.equal(KE2.registry.get('ctrl+z'), null, 'a second vm-loaded instance must start with an empty registry');
});
