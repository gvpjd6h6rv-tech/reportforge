// RF-PREVIEW-MARGINS-1 (editor) — the margin editor writes the render SSOT
// (CommandRuntimeFile._currentLayout.margins) that toJSON()/preview/PDF read.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// mock the render SSOT before loading the engine
globalThis.CommandRuntimeFile = { _currentLayout: { name: 't', margins: null } };
const PME = require('../../engines/PageMarginsEngine.js');

test('get() falls back to defaults when margins are null', () => {
  assert.deepEqual(PME.get(), { top: 15, right: 20, bottom: 15, left: 20 });
});

test('set(side) updates the render SSOT that toJSON would serialize', () => {
  PME.set('top', 40);
  assert.equal(globalThis.CommandRuntimeFile._currentLayout.margins.top, 40);
  assert.equal(PME.get().top, 40);
});

test('set() merges — other sides are preserved', () => {
  PME.set('left', 5);
  const m = globalThis.CommandRuntimeFile._currentLayout.margins;
  assert.equal(m.left, 5);
  assert.equal(m.top, 40); // unchanged from previous test
  assert.equal(m.right, 20);
});

test('set() clamps negatives to 0', () => {
  PME.set('right', -12);
  assert.equal(PME.get().right, 0);
});

test('setAll() applies all four sides', () => {
  PME.setAll({ top: 1, right: 2, bottom: 3, left: 4 });
  assert.deepEqual(PME.get(), { top: 1, right: 2, bottom: 3, left: 4 });
});

test('guard: preview and PDF share the same values (single SSOT)', () => {
  PME.setAll({ top: 11, right: 22, bottom: 33, left: 44 });
  // both /designer-preview and /render read _currentLayout.margins via toJSON,
  // so there is exactly one source -> identical values by construction.
  const ssot = globalThis.CommandRuntimeFile._currentLayout.margins;
  assert.deepEqual(ssot, { top: 11, right: 22, bottom: 33, left: 44 });
  assert.deepEqual(PME.get(), ssot);
});
