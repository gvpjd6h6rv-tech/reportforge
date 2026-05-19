'use strict';
/**
 * SS-14 keyboard — KeyboardRegistry unit tests
 * Tests real contracts: register, get, trigger, off, clear.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadRegistry() {
  const src = fs.readFileSync(resolve(ROOT, 'engines/KeyboardRegistry.js'), 'utf8');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

test('KeyboardRegistry — register and get returns handler', () => {
  const R = loadRegistry();
  const fn = () => {};
  R.register('ctrl+z', fn);
  assert.equal(R.get('ctrl+z'), fn);
});

test('KeyboardRegistry — off removes handler', () => {
  const R = loadRegistry();
  R.register('ctrl+y', () => {});
  R.off('ctrl+y');
  assert.equal(R.get('ctrl+y'), null);
});

test('KeyboardRegistry — trigger calls handler and returns true', () => {
  const R = loadRegistry();
  let called = false;
  R.register('ctrl+b', () => { called = true; });
  const result = R.trigger('ctrl+b', {});
  assert.ok(called, 'handler must be called');
  assert.equal(result, true);
});

test('KeyboardRegistry — trigger returns false for unregistered combo', () => {
  const R = loadRegistry();
  assert.equal(R.trigger('ctrl+x', {}), false);
});

test('KeyboardRegistry — clear removes all handlers', () => {
  const R = loadRegistry();
  R.register('ctrl+a', () => {});
  R.register('ctrl+b', () => {});
  R.clear();
  assert.equal(R.get('ctrl+a'), null);
  assert.equal(R.get('ctrl+b'), null);
});
